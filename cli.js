import { spawn } from "child_process";
import fs from "fs/promises";
import readline from "readline";
import os from "os";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

// QoL: Suppress noisy dotenvx logs
process.env.DOTENV_LOG_LEVEL = "error";
process.env.DOTENV_QUIET = "true";

import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });

if (!process.env.NVIDIA_API_KEY) {
    console.error("\n\x1b[31m[Error]\x1b[0m NVIDIA_API_KEY is missing in your .env file!");
    console.error("Please add it to: " + path.join(__dirname, ".env"));
    process.exit(1);
}

const openai = new OpenAI({
    apiKey: process.env.NVIDIA_API_KEY,
    baseURL: "https://integrate.api.nvidia.com/v1"
});

const MODEL_NAME = 'nvidia/nemotron-3-ultra-550b-a55b';

// ----------------- SPINNER UTILS -----------------
function startSpinner(message) {
    const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    let i = 0;
    return setInterval(() => {
        process.stdout.write(`\r\x1b[33m${frames[i]} ${message}\x1b[0m`);
        i = (i + 1) % frames.length;
    }, 80);
}

function stopSpinner(interval) {
    clearInterval(interval);
    process.stdout.write("\r\x1b[K"); // clear line
}

// ----------------- TOOLS -----------------
async function runCommand(command) {
    console.log(`\x1b[36m[AI Executing]\x1b[0m ${command}\n`);
    return new Promise((resolve) => {
        const child = spawn(command, { shell: true, stdio: ['inherit', 'pipe', 'pipe'] });
        let output = "";
        
        child.stdout.on('data', (data) => {
            const str = data.toString();
            process.stdout.write(str.replace(/\r?\n/g, '\r\n'));
            output += str;
        });
        
        child.stderr.on('data', (data) => {
            const str = data.toString();
            process.stderr.write(str.replace(/\r?\n/g, '\r\n'));
            output += str;
        });
        
        child.on('close', (code) => {
            console.log(""); 
            let finalOut = output.substring(0, 4000);
            if (code !== 0) finalOut += `\n(Command exited with error code ${code})`;
            resolve(finalOut || "Command executed silently.");
        });
        
        child.on('error', (err) => {
            resolve(`ERROR: ${err.message}`);
        });
    });
}

const tools = [
    {
        type: "function",
        function: {
            name: "run_command",
            description: "Run shell commands on the Linux host (e.g., df -h, ls, mkdir, apt-get). Use this to change system settings (gsettings, nmcli, systemctl) or install apps.",
            parameters: {
                type: "object",
                properties: {
                    command: { type: "string", description: "The exact bash command to execute." }
                },
                required: ["command"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "write_file",
            description: "Write code or text content securely to a file without bash escaping issues.",
            parameters: {
                type: "object",
                properties: {
                    filepath: { type: "string", description: "The path to the file (e.g., ~/Desktop/script.py)." },
                    content: { type: "string", description: "The exact content to write." }
                },
                required: ["filepath", "content"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "append_to_file",
            description: "Safely append text to the end of a configuration file (e.g., ~/.bashrc or /etc/hosts) without overwriting it.",
            parameters: {
                type: "object",
                properties: {
                    filepath: { type: "string", description: "The path to the file." },
                    content: { type: "string", description: "The content to append." }
                },
                required: ["filepath", "content"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "read_file",
            description: "Read the contents of a file (e.g., to review code, read logs, or analyze data).",
            parameters: {
                type: "object",
                properties: {
                    filepath: { type: "string", description: "The path to the file to read." }
                },
                required: ["filepath"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "ask_user",
            description: "Ask the user a question and wait for them to type an answer. Use this if you need clarification or permission.",
            parameters: {
                type: "object",
                properties: {
                    question: { type: "string", description: "The question to ask the user." }
                },
                required: ["question"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "search_web",
            description: "Search the web for documentation, tutorials, or command syntaxes. Returns text snippets from search results.",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "The search query (e.g. 'how to change gnome terminal theme command line')." }
                },
                required: ["query"]
            }
        }
    }
];

async function main() {
    const prompt = process.argv.slice(2).join(" ");
    
    // QoL: Help Menu
    if (!prompt || prompt === "-h" || prompt === "--help") {
        console.log(`\n\x1b[32mAsk AI - Autonomous Terminal Assistant\x1b[0m`);
        console.log(`Usage: ask <your prompt here>`);
        console.log(`Example: ask install docker and configure it to run on startup\n`);
        process.exit(1);
    }

    let installedApps = "";
    try {
        if (os.type() === 'Linux') {
            const files = await fs.readdir('/usr/share/applications');
            const apps = files
                .filter(f => f.endsWith('.desktop'))
                .map(f => f.replace('.desktop', ''))
                .filter(f => !f.includes('settings') && !f.startsWith('cinnamon-'));
            installedApps = `\nInstalled GUI Apps: ${apps.join(', ')}`;
        }
    } catch(e) {}

    const osContext = `Operating System: ${os.type()} ${os.release()} ${os.arch()}
Current User: ${os.userInfo().username}
Working Directory: ${process.cwd()}${installedApps}`;

    const SYSTEM_PROMPT = `You are an elite, highly intelligent Linux CLI AI assistant. You help users solve complex tasks autonomously.
You receive basic, high-level requests (e.g., "make my terminal dark", "install docker"). It is YOUR job to figure out the technical implementation.

[ENVIRONMENT CONTEXT]
${osContext}

CRITICAL RULES FOR AUTONOMY:
1. NEVER ASSUME COMMANDS: If you do not know the EXACT command for this specific OS or if your first guess fails, you MUST use the 'search_web' tool to find the correct documentation or error fix before executing anything else.
2. VERIFY SUCCESS: Do not just run a command and assume it worked. If the user asks to change a setting, use a command to verify the setting actually changed. If they ask to install an app, run 'app --version' to prove it installed.
3. MULTI-STEP REASONING: Break complex requests down. E.g., to change terminal colors, you must first find the profile ID, turn off theme colors, and then set the color.
4. PERSEVERANCE: If a command fails, read the error, adapt, and try again. Use 'sudo' if permission is denied.
5. BE CONCISE: The user can see your execution steps. When you finish, output exactly 1 sentence summarizing what you did. DO NOT explain how you did it.
6. SINGLE TOOL CALL: You must only call ONE tool at a time.
7. SPEED: When the user asks to open an app (e.g. terminal, calculator), DO NOT check if it exists using 'which'. Immediately execute the app directly (e.g., 'gnome-terminal &').`;

    let messages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt }
    ];

    let spinner;
    try {
        let maxLoops = 10;
        let finalResponseText = "";
        
        while (maxLoops > 0) {
            maxLoops--;
            
            let finalContent = "";
            let toolCallName = "";
            let toolCallArgs = "";
            let toolCallId = "";
            let isThinkingStarted = false;

            let retryCount = 0;
            while (retryCount < 4) {
                try {
                    const stream = await openai.chat.completions.create({
                        model: MODEL_NAME,
                        messages: messages,
                        tools: tools,
                        temperature: 0.2,
                        max_tokens: 1024,
                        parallel_tool_calls: false,
                        stream: true,
                        chat_template_kwargs: { enable_thinking: true }
                    });
                    
                    finalContent = "";
                    toolCallName = "";
                    toolCallArgs = "";
                    toolCallId = "";
                    isThinkingStarted = false;

                    for await (const chunk of stream) {
                        const delta = chunk.choices[0]?.delta;
                        if (!delta) continue;
                        
                        if (delta.reasoning_content) {
                            if (!isThinkingStarted) {
                                process.stdout.write(`\x1b[90m[AI Reasoning]\n`);
                                isThinkingStarted = true;
                            }
                            process.stdout.write(delta.reasoning_content);
                        }
                        
                        if (delta.content) {
                            if (isThinkingStarted) {
                                process.stdout.write(`\x1b[0m\n\n`);
                                isThinkingStarted = false;
                            }
                            finalContent += delta.content;
                        }
                        
                        if (delta.tool_calls) {
                            if (isThinkingStarted) {
                                process.stdout.write(`\x1b[0m\n\n`);
                                isThinkingStarted = false;
                            }
                            const tc = delta.tool_calls[0];
                            if (tc.id) toolCallId = tc.id;
                            if (tc.function?.name) toolCallName += tc.function.name;
                            if (tc.function?.arguments) toolCallArgs += tc.function.arguments;
                        }
                    }
                    
                    if (isThinkingStarted) {
                        process.stdout.write(`\x1b[0m\n\n`);
                    }
                    
                    break;
                } catch (e) {
                    retryCount++;
                    if (retryCount >= 4) throw e;
                    if (isThinkingStarted) {
                        process.stdout.write(`\x1b[0m\n`);
                    }
                    console.log(`\x1b[33m[API Interrupted - Retrying ${retryCount}/3...]\x1b[0m`);
                    await new Promise(r => setTimeout(r, 2000 * Math.pow(2, retryCount)));
                }
            }
            
            const responseMessage = {
                role: "assistant",
                content: finalContent || null
            };
            
            if (toolCallName) {
                responseMessage.tool_calls = [{
                    id: toolCallId || "call_" + Math.random().toString(36).substring(7),
                    type: "function",
                    function: { name: toolCallName, arguments: toolCallArgs }
                }];
            }
            
            if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
                messages.push(responseMessage);
                
                for (const call of responseMessage.tool_calls) {
                    let result = "";
                    const args = JSON.parse(call.function.arguments);
                    
                    if (call.function.name === "run_command") {
                        result = await runCommand(args.command);
                    } else if (call.function.name === "write_file") {
                        try {
                            const filepath = args.filepath.replace(/^~/, process.env.HOME || '');
                            const dir = path.dirname(filepath);
                            await runCommand(`mkdir -p "${dir}"`); // Ensure directory exists securely
                            await fs.writeFile(filepath, args.content);
                            console.log(`\x1b[36m[AI Executing]\x1b[0m Wrote to file: ${filepath}\n`);
                            result = `Successfully wrote content to ${filepath}`;
                        } catch (err) {
                            result = `ERROR writing file: ${err.message}`;
                        }
                    } else if (call.function.name === "append_to_file") {
                        try {
                            const filepath = args.filepath.replace(/^~/, process.env.HOME || '');
                            await fs.appendFile(filepath, "\n" + args.content);
                            console.log(`\x1b[36m[AI Executing]\x1b[0m Appended to file: ${filepath}\n`);
                            result = `Successfully appended content to ${filepath}`;
                        } catch (err) {
                            result = `ERROR appending to file: ${err.message}`;
                        }
                    } else if (call.function.name === "read_file") {
                        try {
                            const filepath = args.filepath.replace(/^~/, process.env.HOME || '');
                            const content = await fs.readFile(filepath, 'utf8');
                            console.log(`\x1b[36m[AI Executing]\x1b[0m Read file: ${filepath}\n`);
                            result = content.substring(0, 8000); // Prevent context window overflow
                        } catch (err) {
                            result = `ERROR reading file: ${err.message}`;
                        }
                    } else if (call.function.name === "ask_user") {
                        const rl = readline.createInterface({
                            input: process.stdin,
                            output: process.stdout
                        });
                        result = await new Promise((resolve) => {
                            rl.question(`\n\x1b[35m[AI Asks]\x1b[0m ${args.question} `, (answer) => {
                                rl.close();
                                resolve(answer);
                            });
                        });
                    } else if (call.function.name === "search_web") {
                        try {
                            console.log(`\x1b[35m[AI Searching Web]\x1b[0m ${args.query}\n`);
                            const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(args.query)}`, {
                                headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; rv:109.0) Gecko/20100101 Firefox/115.0" }
                            });
                            const html = await response.text();
                            
                            const snippets = [];
                            const regex = /<a class="result__snippet[^>]*>(.*?)<\/a>/g;
                            let match;
                            while ((match = regex.exec(html)) !== null && snippets.length < 5) {
                                let text = match[1].replace(/<\/?[^>]+(>|$)/g, ""); // remove tags
                                text = text.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&"); // basic decode
                                snippets.push(text);
                            }
                            
                            if (snippets.length > 0) {
                                result = "Search Results:\n" + snippets.map((s, i) => `${i+1}. ${s}`).join("\n");
                            } else {
                                result = "No relevant search results found. Try using run_command with curl, or guess the command.";
                            }
                        } catch (err) {
                            result = `ERROR searching web: ${err.message}`;
                        }
                    }
                    
                    messages.push({
                        role: "tool",
                        tool_call_id: call.id,
                        content: result
                    });
                }
            } else {
                finalResponseText = responseMessage.content || "";
                break;
            }
        }
        
        console.log(`\x1b[32m[AI]\x1b[0m ${finalResponseText}\n`);
    } catch (error) {
        if (spinner) stopSpinner(spinner);
        console.error("\n\x1b[31m[Error]\x1b[0m", error.message);
    }
}

main();
