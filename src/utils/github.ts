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

  constructor(token: string, repoUrl: string) {
    this.token = token;
    const parts = repoUrl.replace('https://github.com/', '').split('/');
    this.owner = parts[0];
    this.repo = parts[1].replace('.git', '');
  }

  private get headers() {
    return {
      Authorization: `token ${this.token}`,
      Accept: 'application/vnd.github.v3+json',
    };
  }

  async getAllMarkdownFiles(): Promise<GitHubFile[]> {
    const files: GitHubFile[] = [];
    
    const fetchDir = async (path: string = '') => {
      const response = await axios.get(
        `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${path}`,
        { headers: this.headers }
      );

      for (const item of response.data) {
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

    await fetchDir();
    return files;
  }

  async getFileContent(path: string): Promise<string> {
    const response = await axios.get(
      `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${path}`,
      { headers: this.headers }
    );
    // decode base64
    return atob(response.data.content.replace(/\n/g, ''));
  }

  async createDraftPR(
    branchName: string,
    title: string,
    body: string,
    files: { path: string; content: string }[]
  ) {
    // 1. Get default branch SHA
    const repoInfo = await axios.get(
      `https://api.github.com/repos/${this.owner}/${this.repo}`,
      { headers: this.headers }
    );
    const defaultBranch = repoInfo.data.default_branch;
    const branchRes = await axios.get(
      `https://api.github.com/repos/${this.owner}/${this.repo}/git/ref/heads/${defaultBranch}`,
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

    // 3. Create Tree and Commit (Simplified: update files one by one for this demo)
    for (const file of files) {
        // Get current file SHA
        const currentFile = await axios.get(
            `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${file.path}?ref=${branchName}`,
            { headers: this.headers }
        );
        
        await axios.put(
            `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${file.path}`,
            {
                message: `chore: fix documentation link in ${file.path}`,
                content: btoa(file.content),
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
        base: defaultBranch,
        draft: true
      },
      { headers: this.headers }
    );

    return prRes.data.html_url;
  }
}
