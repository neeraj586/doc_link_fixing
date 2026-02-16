import React, { useState } from 'react';
import { GitHubService, type GitHubFile } from '../utils/github';
import { LinkCheckerService, type BrokenLink } from '../utils/linkChecker';
import {
    Search,
    ExternalLink,
    AlertCircle,
    CheckCircle2,
    Settings2,
    GitPullRequest,
    Loader2,
    FileText,
    Terminal,
    RefreshCw
} from 'lucide-react';

const Dashboard: React.FC = () => {
    const [token, setToken] = useState(localStorage.getItem('gh_token') || '');
    const [repoUrl, setRepoUrl] = useState('https://github.com/neeraj586/doc_link_fixing');
    const [branch, setBranch] = useState('v1.0');
    const [specificPath, setSpecificPath] = useState('');
    const [isScanning, setIsScanning] = useState(false);
    const [isFixing, setIsFixing] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0, phase: '' });
    const [brokenLinks, setBrokenLinks] = useState<BrokenLink[]>([]);
    const [scanComplete, setScanComplete] = useState(false);
    const [prUrl, setPrUrl] = useState<string | null>(null);

    const saveToken = (val: string) => {
        setToken(val);
        localStorage.setItem('gh_token', val);
    };

    const runScan = async () => {
        if (!token || !repoUrl) {
            alert('Please provide a GitHub Token and Repo URL');
            return;
        }

        setIsScanning(true);
        setScanComplete(false);
        setBrokenLinks([]);
        setPrUrl(null);

        try {
            const gh = new GitHubService(token, repoUrl, branch);
            const lc = new LinkCheckerService();

            setProgress({ current: 0, total: 0, phase: 'Fetching Sitemap...' });
            await lc.fetchSitemap();

            setProgress({ current: 0, total: 0, phase: 'Fetching Markdown Files...' });
            const files: GitHubFile[] = await gh.getAllMarkdownFiles(specificPath);

            setProgress({ current: 0, total: files.length, phase: 'Scanning for broken links...' });

            const foundBroken: BrokenLink[] = [];

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                setProgress(p => ({ ...p, current: i + 1 }));

                const content = await gh.getFileContent(file.path);
                const links = lc.extractLinks(content);

                for (const link of links) {
                    const isOk = await lc.checkUrl(link);
                    if (!isOk) {
                        const suggestion = lc.suggestBestMatch(link);
                        foundBroken.push({
                            fileName: file.path.split('/').pop() || '',
                            filePath: file.path,
                            brokenUrl: link,
                            suggestedUrl: suggestion.url,
                            confidence: Math.round(suggestion.confidence * 100)
                        });
                    }
                }
            }

            setBrokenLinks(foundBroken);
            setScanComplete(true);
        } catch (err: any) {
            console.error(err);
            alert(`Error during scan: ${err.message}`);
        } finally {
            setIsScanning(false);
        }
    };

    const createPR = async () => {
        if (brokenLinks.length === 0) return;
        setIsFixing(true);

        try {
            const gh = new GitHubService(token, repoUrl, branch);

            // Group fixes by file
            const fileFixes: Record<string, { path: string; content: string }> = {};

            // We need to fetch original content again and replace
            for (const link of brokenLinks) {
                if (!link.suggestedUrl) continue;

                if (!fileFixes[link.filePath]) {
                    const originalContent = await gh.getFileContent(link.filePath);
                    fileFixes[link.filePath] = { path: link.filePath, content: originalContent };
                }

                fileFixes[link.filePath].content = fileFixes[link.filePath].content.replace(
                    new RegExp(link.brokenUrl, 'g'),
                    link.suggestedUrl
                );
            }

            const branchName = `fix-doc-links-${Date.now()}`;
            const prLink = await gh.createDraftPR(
                branchName,
                'chore: fix broken documentation links',
                'This PR automatically fixes broken documentation links discovered by the Link Fixer Tool.\n\n' +
                brokenLinks.map(l => `- [ ] ${l.filePath}: ${l.brokenUrl} -> ${l.suggestedUrl}`).join('\n'),
                Object.values(fileFixes)
            );

            setPrUrl(prLink);
        } catch (err: any) {
            console.error(err);
            alert(`Error creating PR: ${err.message}`);
        } finally {
            setIsFixing(false);
        }
    };

    return (
        <div className="container">
            <header style={{ marginBottom: '3rem', textAlign: 'center' }}>
                <h1 style={{ fontSize: '3rem', margin: '0.5rem' }}>LinkFixer AI</h1>
                <p style={{ color: '#94a3b8', fontSize: '1.2rem' }}>Automated Documentation Repair Tool</p>
            </header>

            <div className="glass-card">
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 0.8fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: '#94a3b8' }}>
                            <Settings2 size={16} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> GitHub Token
                        </label>
                        <input
                            type="password"
                            placeholder="ghp_xxxxxxxxxxxx"
                            value={token}
                            onChange={(e) => saveToken(e.target.value)}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: '#94a3b8' }}>
                            <Terminal size={16} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> Repo URL
                        </label>
                        <input
                            type="text"
                            placeholder="https://github.com/user/repo"
                            value={repoUrl}
                            onChange={(e) => {
                                const val = e.target.value;
                                const extracted = GitHubService.extractPathFromUrl(val);
                                if (extracted.repo) setRepoUrl(extracted.repo);
                                else setRepoUrl(val);
                                if (extracted.branch) setBranch(extracted.branch);
                                if (extracted.path && extracted.path !== val) setSpecificPath(extracted.path);
                            }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: '#94a3b8' }}>
                            <GitPullRequest size={16} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> Branch
                        </label>
                        <input
                            type="text"
                            placeholder="v1.0"
                            value={branch}
                            onChange={(e) => setBranch(e.target.value)}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: '#94a3b8' }}>
                            <FileText size={16} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> Path (Optional)
                        </label>
                        <input
                            type="text"
                            placeholder="docs/intro.md"
                            value={specificPath}
                            onChange={(e) => {
                                const val = e.target.value;
                                const extracted = GitHubService.extractPathFromUrl(val);
                                if (extracted.repo) setRepoUrl(extracted.repo);
                                if (extracted.branch) setBranch(extracted.branch);
                                setSpecificPath(extracted.path);
                            }}
                        />
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <button
                        onClick={runScan}
                        disabled={isScanning || !token}
                        style={{ minWidth: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                    >
                        {isScanning ? <Loader2 className="animate-spin" /> : <Search size={20} />}
                        {isScanning ? 'Scanning...' : 'Start Scan'}
                    </button>
                </div>
            </div>

            {isScanning && (
                <div className="glass-card" style={{ textAlign: 'center' }}>
                    <h3 style={{ marginBottom: '1rem' }}>{progress.phase}</h3>
                    <div style={{ width: '100%', height: '8px', background: '#1e293b', borderRadius: '4px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                        <div
                            style={{
                                width: `${progress.total ? (progress.current / progress.total) * 100 : 50}%`,
                                height: '100%',
                                background: 'linear-gradient(90deg, #4f46e5, #9333ea)',
                                transition: 'width 0.3s ease'
                            }}
                        />
                    </div>
                    <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
                        Processed {progress.current} of {progress.total} files
                    </p>
                </div>
            )}

            {scanComplete && (
                <div className="glass-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                        <h2>Scan Results</h2>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button className="secondary-btn" onClick={runScan} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <RefreshCw size={16} /> Rescan
                            </button>
                            <button
                                onClick={createPR}
                                disabled={brokenLinks.length === 0 || isFixing}
                                style={{ background: 'linear-gradient(135deg, #059669, #10b981)', display: 'flex', alignItems: 'center', gap: '8px' }}
                            >
                                {isFixing ? <Loader2 className="animate-spin" size={18} /> : <GitPullRequest size={18} />}
                                {isFixing ? 'Creating PR...' : 'Create Draft PR with Fixes'}
                            </button>
                        </div>
                    </div>

                    {prUrl && (
                        <div style={{ padding: '1rem', background: 'rgba(52, 211, 153, 0.1)', border: '1px solid #10b981', borderRadius: '8px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <CheckCircle2 color="#10b981" />
                                <span>PR successfully created!</span>
                            </div>
                            <a href={prUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                                View on GitHub <ExternalLink size={14} />
                            </a>
                        </div>
                    )}

                    {brokenLinks.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                            <CheckCircle2 size={48} color="#10b981" style={{ marginBottom: '1rem' }} />
                            <h3>All clear! No broken links found.</h3>
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table>
                                <thead>
                                    <tr>
                                        <th><FileText size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> File Name</th>
                                        <th><AlertCircle size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> Broken URL</th>
                                        <th><CheckCircle2 size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> Suggested URL</th>
                                        <th>Confidence</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {brokenLinks.map((link, idx) => (
                                        <tr key={idx}>
                                            <td>
                                                <div style={{ fontWeight: 500 }}>{link.fileName}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{link.filePath}</div>
                                            </td>
                                            <td style={{ color: '#f87171', fontSize: '0.85rem' }}>{link.brokenUrl}</td>
                                            <td style={{ color: '#4ade80', fontSize: '0.85rem' }}>{link.suggestedUrl}</td>
                                            <td>
                                                <span className={`confidence-${(link.confidence || 0) > 80 ? 'high' : (link.confidence || 0) > 50 ? 'medium' : 'low'}`} style={{ fontWeight: 600 }}>
                                                    {link.confidence}%
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default Dashboard;
