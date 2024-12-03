const axios = require('axios');
const { exec } = require('child_process');

const typoOutput = process.env.TYPO_OUTPUT;
const githubToken = process.env.GITHUB_TOKEN;
const repo = process.env.REPO;
const pullNumber = process.env.PULL_NUMBER;
const commitId = process.env.COMMIT_ID;

async function sendPostRequest({ body, path, line }) {
  const url = `https://api.github.com/repos/${repo}/pulls/${pullNumber}/comments`;

  const data = {
    side: 'RIGHT',
    commit_id: commitId,
    body,
    path,
    line
  };

  const axiosInstance = axios.create({
    baseURL: 'https://api.github.com',
    headers: {
      Authorization: `Bearer ${githubToken}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  try {
    const response = await axiosInstance.post(url, data);
    return response.data;
  } catch (error) {
    handleError(error);
  }
}

function handleError(error) {
  if (error.response) {
    // HTTP response error (e.g., 404, 500)
    console.error(`GitHub API Error: ${error.response.status}`, error.response.data);
  } else if (error.request) {
    // No response received
    console.error('No response received:', error.request);
  } else {
    // Other errors (e.g., setup issues)
    console.error('Error during POST request:', error.message);
  }
}

const execPromise = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (err, stdout, stderr) => {
      if (err) {
        reject(err);
        return;
      }
      if (stderr) {
        reject(stderr);
        return;
      }
      resolve(stdout);
    });
  });
};

async function processTypos() {
  if (typoOutput) {
    const typoArray = typoOutput.split('\n').map(line => line.trim()).filter(line => line);

    const parsedTypos = typoArray.map(typo => {
      const [file, line, column, typoDetail] = typo.split(':');
      const typoMatch = typoDetail.match(/`(.*?)` -> `(.*?)`/);
      const [incorrectWord, correctWord] = typoMatch ? typoMatch.slice(1) : [];

      return {
        file: file.trim(),
        line: parseInt(line.trim(), 10),
        column: parseInt(column.trim(), 10),
        incorrectWord: incorrectWord.trim(),
        correctWord: correctWord.trim(),
      };
    });

    if (parsedTypos) {
      for (const typo of parsedTypos) {
        const file = typo.file;
        const line = typo.line;
        const incorrectWord = typo.incorrectWord;
        const correctWord = typo.correctWord;
        const execCommandLine = `git show HEAD:${file} | sed -n '${line}p'`;
        const stdout = await execPromise(execCommandLine);
        const suggestionContent = stdout.replace(incorrectWord, correctWord);
        const body = `\`\`\`suggestion\n${suggestionContent}\`\`\`\nPlease check this typo. Replace \`${incorrectWord}\` with \`${correctWord}\`.`

        await sendPostRequest({
          body,
          path: file,
          line,
        });
      }
    }
  } else {
    console.log('No typos found!');
  }
}

processTypos();