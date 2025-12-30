# Repo Browser

A minimalist GitHub repository browser with AI-powered code annotations. Analyze any public repository and get intelligent insights about the code structure and functionality.

## Features

- **Repository Analysis**: Paste any GitHub repository URL to browse its contents
- **AI Annotations**: Automatically generated code explanations for each file
- **Language Detection**: Identifies programming languages used across the repository
- **File Filtering**: Excludes binary files and focuses on analyzable code
- **Caching System**: Stores analyzed repositories for instant re-access
- **Repository Summaries**: Generate concise overviews of entire projects

## Getting Started

### Prerequisites

- Node.js 16.x or higher
- OpenRouter API key
- GitHub personal access token (optional, for higher rate limits)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/life2harsh/GitExplainer_AIWrapper.git
cd GitExplainer_AIWrapper
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```env
OPENROUTER_API_KEY=your_openrouter_api_key_here
GITHUB_TOKEN=your_github_token_here
```

4. Start the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Usage

1. Paste a GitHub repository URL into the input field
2. Click "Analyze Repo" to fetch and analyze the repository
3. Browse files from the sidebar
4. View AI-generated annotations alongside the code
5. Use the "Summarize Repo" button for a quick project overview

## Technology Stack

- **Framework**: Next.js 16.1.1 with React
- **Language**: TypeScript
- **AI Provider**: OpenRouter API (using kat-coder-pro model)
- **Syntax Highlighting**: react-syntax-highlighter
- **Styling**: Tailwind CSS

## API Routes

- `/api/repo` - Fetches repository contents and generates batch annotations
- `/api/annotate` - Generates annotations for individual files
- `/api/summarize` - Creates repository summaries

## Configuration

The application uses the following environment variables:

- `OPENROUTER_API_KEY` - Required for AI-powered annotations
- `GITHUB_TOKEN` - Optional, improves GitHub API rate limits

## License

This project is open source and available under the MIT License.

## Contributing

Contributions are welcome. Please feel free to submit issues or pull requests.

