import React, { useState } from 'react';
import { X, Github, Copy, Check } from 'lucide-react';

interface GitHubPagesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GitHubPagesModal: React.FC<GitHubPagesModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [copiedAction, setCopiedAction] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);

  if (!isOpen) return null;

  const githubActionYaml = `name: Deploy Lost Quotes to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: 'pages'
  cancel-in-progress: true

jobs:
  deploy:
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: |
          if [ -f package-lock.json ]; then
            npm ci
          else
            npm install
          fi

      - name: Build static site
        run: npm run build

      - name: Setup Pages
        uses: actions/configure-pages@v4

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: './dist'

  deploy:
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
`;

  const quickCommands = `git init
git add .
git commit -m "Initial commit of Lost Quotes"
git branch -M main
git remote add origin https://github.com/<YOUR-USERNAME>/lost-quotes.git
git push -u origin main`;

  const copyToClipboard = (text: string, type: 'action' | 'cmd') => {
    navigator.clipboard.writeText(text);
    if (type === 'action') {
      setCopiedAction(true);
      setTimeout(() => setCopiedAction(false), 2000);
    } else {
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#13161e] w-full max-w-2xl rounded-xl border border-zinc-800 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <Github className="w-4 h-4 text-zinc-200" />
            <div>
              <h3 className="text-sm font-semibold text-white">Deploy to GitHub Pages</h3>
              <p className="text-xs text-zinc-400">Static build pre-configured with relative paths</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto text-xs text-zinc-300">
          <p className="text-zinc-400 leading-relaxed">
            <code className="text-amber-400 font-mono">vite.config.ts</code> uses{' '}
            <code className="text-amber-400 font-mono">base: &apos;./&apos;</code> so all scripts
            and Web Audio assets load cleanly from any GitHub Pages subpath.
          </p>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-white">1. GitHub Actions Workflow</h4>
              <button
                onClick={() => copyToClipboard(githubActionYaml, 'action')}
                className="flex items-center gap-1 font-mono text-amber-400 hover:text-amber-300 cursor-pointer"
              >
                {copiedAction ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedAction ? 'Copied' : 'Copy YAML'}</span>
              </button>
            </div>
            <p className="text-zinc-400">
              Save at <code className="text-zinc-200 font-mono">.github/workflows/deploy.yml</code>{' '}
              and set repository Settings &gt; Pages &gt; Source to GitHub Actions.
            </p>
            <pre className="bg-[#0c0e13] border border-zinc-800 p-3 rounded-lg overflow-x-auto text-[11px] font-mono text-zinc-300 max-h-40">
              {githubActionYaml}
            </pre>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-white">2. Push to Repository</h4>
              <button
                onClick={() => copyToClipboard(quickCommands, 'cmd')}
                className="flex items-center gap-1 font-mono text-amber-400 hover:text-amber-300 cursor-pointer"
              >
                {copiedCmd ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedCmd ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <pre className="bg-[#0c0e13] border border-zinc-800 p-3 rounded-lg overflow-x-auto text-[11px] font-mono text-zinc-300">
              {quickCommands}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
