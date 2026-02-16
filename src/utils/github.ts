import axios from 'axios';

export interface GitHubFile {
  path: string;
  url: string;
  download_url: string;
}

export class GitHubService {
  private token: string;
  private owner: string;
  private repo: string;
  private branch: string;

  constructor(token: string, repoUrl: string, branch: string = '') {
    this.token = token;
    const parts = repoUrl.replace('https://github.com/', '').split('/');
    this.owner = parts[0];
    this.repo = parts[1].replace('.git', '');
    this.branch = branch;
  }

  private get headers() {
    return {
      Authorization: `token ${this.token}`,
      Accept: 'application/vnd.github.v3+json',
    };
  }

  async getAllMarkdownFiles(specificPath: string = ''): Promise<GitHubFile[]> {
    const files: GitHubFile[] = [];

    // If branch is not specified, we'll need to find the default branch
    if (!this.branch) {
      const repoInfo = await axios.get(
        `https://api.github.com/repos/${this.owner}/${this.repo}`,
        { headers: this.headers }
      );
      this.branch = repoInfo.data.default_branch;
    }

    const fetchDir = async (path: string) => {
      const response = await axios.get(
        `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${path}?ref=${this.branch}`,
        { headers: this.headers }
      );

      const items = Array.isArray(response.data) ? response.data : [response.data];

      for (const item of items) {
        if (item.type === 'dir') {
          await fetchDir(item.path);
        } else if (item.name.endsWith('.md')) {
          files.push({
            path: item.path,
            url: item.url,
            download_url: item.download_url
          });
        }
      }
    };

    try {
      await fetchDir(specificPath);
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new Error(`Path "${specificPath}" not found in branch "${this.branch}"`);
      }
      throw error;
    }

    return files;
  }

  async getFileContent(path: string): Promise<string> {
    const response = await axios.get(
      `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${path}?ref=${this.branch}`,
      { headers: this.headers }
    );
    // decode base64 utf-8
    const bytes = Uint8Array.from(atob(response.data.content.replace(/\n/g, '')), c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  async createDraftPR(
    branchName: string,
    title: string,
    body: string,
    files: { path: string; content: string }[]
  ) {
    // 1. Get base branch SHA
    const branchRes = await axios.get(
      `https://api.github.com/repos/${this.owner}/${this.repo}/git/ref/heads/${this.branch}`,
      { headers: this.headers }
    );
    const baseSha = branchRes.data.object.sha;

    // 2. Create new branch
    await axios.post(
      `https://api.github.com/repos/${this.owner}/${this.repo}/git/refs`,
      {
        ref: `refs/heads/${branchName}`,
        sha: baseSha,
      },
      { headers: this.headers }
    );

    // 3. Create Tree and Commit
    for (const file of files) {
      // Get current file SHA on the new branch
      const currentFile = await axios.get(
        `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${file.path}?ref=${branchName}`,
        { headers: this.headers }
      );

      await axios.put(
        `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${file.path}`,
        {
          message: `chore: fix documentation link in ${file.path}`,
          content: btoa(unescape(encodeURIComponent(file.content))),
          sha: currentFile.data.sha,
          branch: branchName
        },
        { headers: this.headers }
      );
    }

    // 4. Create Pull Request
    const prRes = await axios.post(
      `https://api.github.com/repos/${this.owner}/${this.repo}/pulls`,
      {
        title,
        body,
        head: branchName,
        base: this.branch,
        draft: true
      },
      { headers: this.headers }
    );

    return prRes.data.html_url;
  }
}
