# Contributing to Ubuntu Realtime Server Sentinel

Thank you for your interest in contributing to **Ubuntu Realtime Server Sentinel (`webstring`)**! We welcome all contributions, including bug reports, feature requests, documentation improvements, and code submissions.

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v18.x or higher
- **npm**: v9.x or higher
- **MongoDB Atlas** or a local MongoDB instance
- **Ubuntu Linux** (recommended for testing system telemetry features)

### Local Development Setup

1. **Fork & Clone the Repository**:
   ```bash
   git clone https://github.com/YOUR-USERNAME/webstring.git
   cd webstring
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Copy `.env.example` to `.env` and fill in your connection string and credentials:
   ```bash
   cp .env.example .env
   ```

4. **Start Development Servers**:
   Run both backend server (Node/Express) and frontend dev server (Vite) concurrently:
   ```bash
   npm run dev:all
   ```

   Open your browser at `http://localhost:3000`.

---

## 🌿 Git Workflow & Pull Requests

1. **Create a Feature Branch**:
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

2. **Commit Your Changes**:
   Write clear, concise commit messages:
   ```bash
   git commit -m "feat: add disk usage alert threshold config"
   ```

3. **Validate Your Build**:
   Ensure the application builds clean without errors:
   ```bash
   npm run build
   ```

4. **Push & Open a PR**:
   Push to your fork and submit a Pull Request against the `main` branch. Describe your changes clearly and link any relevant issue.

---

## 🎨 Code Style Guidelines

- **JavaScript**: Use modern ES6+ syntax (async/await, modules, destructuring).
- **Backend**: Place REST routes under `server/routes/` and controllers/utilities in modular files.
- **Frontend**: Keep React/Vanilla JS components modular under `src/components/` and pages under `src/pages/`.
- **Styling**: Maintain a clean, minimalist developer aesthetic (**no unnecessary gradients or marquee text** as specified in the project design guidelines).

---

## 🐛 Reporting Bugs

Before creating a bug report, please check existing issues to ensure it hasn't already been reported. When creating a bug report, please include:
- A clear, descriptive title.
- Steps to reproduce the problem.
- Expected vs. actual behavior.
- Operating system, Node.js version, and relevant browser console/terminal logs.

---

## 📜 Code of Conduct

Please note that this project is released with a Contributor Code of Conduct. By participating in this project, you agree to abide by its terms. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
