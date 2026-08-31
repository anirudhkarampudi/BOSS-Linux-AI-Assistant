# Ask AI: Autonomous Command Line Agent

## Overview
Ask AI is a highly autonomous, agentic command-line interface (CLI) that bridges the gap between natural language requests and complex Linux system administration. Designed and optimized primarily for **BOSS Linux** (Bharat Operating System Solutions), the CLI is powered by Nemotron-3-Ultra 550B via the NVIDIA NIM API. The system does not simply output commands for the user to copy; it actively executes them, parses the resulting standard output and standard error streams, and iterates on a self-correcting reasoning loop until the objective is accomplished.

## Demonstration Videos

Watch the autonomous AI in action in these live demonstrations:

### Demo 1
[![Ask AI Demonstration 1](https://img.youtube.com/vi/TqsjiS3iXb4/0.jpg)](https://youtu.be/TqsjiS3iXb4)

### Demo 2
[![Ask AI Demonstration 2](https://img.youtube.com/vi/Af5MMePD9co/0.jpg)](https://youtu.be/Af5MMePD9co)

## Installation

### Prerequisites
- Node.js (v18 or higher)
- npm (Node Package Manager)
- Bash or compatible shell environment

### Setup Instructions
1. Clone the repository to your local machine:
   ```bash
   git clone https://github.com/Guhapriyan-GP/BOSS-CMD_AI.git
   ```
2. Navigate into the repository directory:
   ```bash
   cd BOSS-CMD_AI
   ```
3. Grant execution permissions to the installation script:
   ```bash
   chmod +x install.sh
   ```
4. Execute the installation script:
   ```bash
   ./install.sh
   ```
   The installation script will automatically run `npm install` to resolve dependencies (such as the OpenAI SDK and Dotenvx) and will append an alias for the `ask` command to your `~/.bashrc` file.
5. Reload your shell environment to apply the alias globally:
   ```bash
   source ~/.bashrc
   ```

## Note: For the purposes of hackathon evaluation, the necessary `.env` variables and API keys have been bundled with the repository. Do not deploy this repository publicly without removing the `.env` file.

## Usage
Once installed, the CLI can be invoked globally using the `ask` command followed by a natural language instruction.

### Examples:
- `ask "Update the system packages. If you encounter an error, fix it."`
- `ask "Ask me for a URL, then create a bash script on my desktop that pings it 3 times. Run the script."`
- `ask "Search the web for the exact command to find the 3 largest files in /var/log, then execute it."`

## Internal Architecture & Mechanisms

The software is constructed around a strict Agentic Reasoning Loop, allowing it to transition from a static language model into an autonomous systems engineer. Below is a detailed breakdown of the internal mechanisms.

### 1. Dynamic Context Injection
Before the language model generates a response, the CLI synchronously intercepts the host environment to build a detailed system context. 
- **System Metrics:** Injects the OS type, kernel release, architecture, active user, and current working directory.
- **GUI Application Indexing:** The script executes a sub-millisecond read of `/usr/share/applications` to extract the `.desktop` files of all installed GUI applications. This index is passed to the language model in the system prompt, allowing the AI to launch complex applications (like `firefox-esr` or `gnome-terminal`) instantly without requiring external database lookups.

### 2. Autonomous Reasoning Loop
The core execution engine relies on a synchronous `while` loop (capped at 10 iterations to prevent infinite recursion). The AI is strictly instructed to call one tool at a time. If a tool fails (e.g., a package is missing or a permission is denied), the AI reads the error output, adjusts its approach, and calls a new tool in the next iteration. It does not terminate until the user's request is verifiably completed.

### 3. Native Web Scraping (search_web)
To prevent the model from guessing deprecated or obscure Linux commands, it is equipped with a `search_web` tool. This tool natively queries DuckDuckGo's HTML endpoint using standard Node.js `fetch` requests. It utilizes regular expressions to strip HTML tags and extract text snippets directly into the prompt context. This provides the AI with real-time documentation and StackOverflow solutions without the heavy overhead of a headless browser.

### 4. Interactive Pausing (ask_user)
If a user prompt is underspecified, the AI is programmed to pause its execution thread and yield control back to the terminal using Node's `readline` module. The AI will prompt the user for clarification (e.g., asking for a URL, a file name, or explicit permission to delete a directory), ingest the user's string input, and resume the execution loop.

### 5. File System Modification (write_file & append_to_file)
Language models typically struggle to write multi-line configuration files using bash commands like `echo` or `cat` due to complex string escaping rules. Ask AI bypasses this limitation by utilizing native Node.js filesystem modules (`fs/promises`). The AI passes raw strings to the `write_file` or `append_to_file` tools, which safely resolve absolute paths, create necessary parent directories, and modify the files securely.
