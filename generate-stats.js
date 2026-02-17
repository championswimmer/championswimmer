#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')

const LANGUAGE_COLORS = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  Python: '#3572A5',
  Java: '#b07219',
  'C++': '#f34b7d',
  C: '#555555',
  'C#': '#239120',
  Go: '#00ADD8',
  Rust: '#dea584',
  Ruby: '#701516',
  PHP: '#4F5D95',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  Dart: '#00B4AB',
  Scala: '#c22d40',
  HTML: '#e34c26',
  CSS: '#563d7c',
  SCSS: '#c6538c',
  Shell: '#89e051',
  Vue: '#41b883',
  Svelte: '#ff3e00',
  Lua: '#000080',
  Perl: '#394579',
  R: '#198CE7',
  MATLAB: '#e16737',
  Dockerfile: '#384d54',
  Makefile: '#427819',
  Vim: '#199f4b',
  Emacs: '#c065db',
  Haskell: '#5e5086',
  Elixir: '#6e4a7e',
  Clojure: '#db5855',
  'Jupyter Notebook': '#DA5B0B',
  CoffeeScript: '#244776',
  Objective: '#438eff',
  Assembly: '#6E4C13',
  Groovy: '#4298b8',
  PowerShell: '#012456',
  Default: '#555555'
}

const CACHE_FILE = path.join(__dirname, 'language-colors-cache.json')
let cachedLanguageColors = null

async function loadLanguageColors() {
  if (cachedLanguageColors) {
    console.log('Using cached language colors')
    return cachedLanguageColors
  }

  if (fs.existsSync(CACHE_FILE)) {
    try {
      const cacheData = fs.readFileSync(CACHE_FILE, 'utf-8')
      const cache = JSON.parse(cacheData)
      const cacheAge = Date.now() - cache.timestamp
      const oneDay = 24 * 60 * 60 * 1000
      
      if (cacheAge < oneDay) {
        console.log('Using cached language colors from file (less than 1 day old)')
        cachedLanguageColors = cache.colors
        return cachedLanguageColors
      }
      console.log('Language colors cache expired, refreshing...')
    } catch (e) {
      console.log('Failed to read cache, fetching fresh data...')
    }
  }

  console.log('Fetching language colors from GitHub Linguist...')
  try {
    const response = await fetch('https://raw.githubusercontent.com/github/linguist/master/lib/linguist/languages.yml')
    
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`)
    }
    
    const yamlContent = await response.text()
    const languages = yaml.load(yamlContent)
    
    const languageColors = {}
    for (const [name, config] of Object.entries(languages)) {
      if (config.color) {
        languageColors[name] = config.color
      }
    }
    
    cachedLanguageColors = languageColors
    
    const cacheData = {
      timestamp: Date.now(),
      colors: languageColors
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData, null, 2))
    console.log(`Loaded ${Object.keys(languageColors).length} language colors from GitHub Linguist`)
    
    return languageColors
  } catch (e) {
    console.error(`Failed to fetch language colors: ${e.message}`)
    console.log('Falling back to hardcoded LANGUAGE_COLORS')
    return LANGUAGE_COLORS
  }
}

function getLanguageColor(languageName, githubColor, languageColors) {
  return githubColor || languageColors[languageName] || LANGUAGE_COLORS[languageName] || LANGUAGE_COLORS.Default
}

function formatNumber(num) {
  return num.toLocaleString()
}

async function getGitHubToken() {
  if (process.env.USER_API_TOKEN) {
    return process.env.USER_API_TOKEN
  }

  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN
  }
  
  try {
    const { execSync } = require('child_process')
    const token = execSync('gh auth token', { encoding: 'utf-8' }).trim()
    if (token) return token
  } catch (e) {
    console.error('Could not get token from gh auth token')
  }
  
  throw new Error('No GitHub token found. Set GITHUB_TOKEN env var or use gh auth login')
}

function isTransientGraphQLError(errors) {
  return errors.some(error => {
    const message = String(error.message || '')
    const type = String(error.type || '')
    return message.includes('Something went wrong') || type === 'INTERNAL'
  })
}

async function graphqlQuery(token, query, variables = {}) {
  const maxAttempts = 5
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'readme-stats-generator',
        },
        body: JSON.stringify({ query, variables }),
      })

      const requestId = response.headers.get('x-github-request-id')
      const rateLimitRemaining = response.headers.get('x-ratelimit-remaining')
      const rateLimitReset = response.headers.get('x-ratelimit-reset')

      if (!response.ok) {
        const statusText = response.statusText || 'Request failed'
        if (attempt < maxAttempts) {
          const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000)
          console.log(`  Attempt ${attempt}/${maxAttempts} failed (${response.status} ${statusText}), requestId=${requestId || 'n/a'}, remaining=${rateLimitRemaining || 'n/a'}, retrying in ${Math.ceil(delayMs / 1000)}s...`)
          await new Promise(resolve => setTimeout(resolve, delayMs))
          continue
        }
        throw new Error(`GraphQL HTTP ${response.status}: ${statusText} (requestId=${requestId || 'n/a'}, remaining=${rateLimitRemaining || 'n/a'})`)
      }

      const data = await response.json()

      if (data.errors) {
        const errorsSummary = JSON.stringify(data.errors)
        console.log(`  GraphQL errors (requestId=${requestId || 'n/a'}, remaining=${rateLimitRemaining || 'n/a'}, reset=${rateLimitReset || 'n/a'}): ${errorsSummary}`)
        const shouldRetry = isTransientGraphQLError(data.errors)
        if (shouldRetry && attempt < maxAttempts) {
          const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000)
          console.log(`  Attempt ${attempt}/${maxAttempts} failed (transient API error), retrying in ${Math.ceil(delayMs / 1000)}s...`)
          await new Promise(resolve => setTimeout(resolve, delayMs))
          continue
        }
        throw new Error(`GraphQL Error: ${errorsSummary}`)
      }
      
      return data.data
    } catch (err) {
      if (attempt < maxAttempts) {
        const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000)
        console.log(`  Attempt ${attempt}/${maxAttempts} failed (error), retrying in ${Math.ceil(delayMs / 1000)}s...`)
        await new Promise(resolve => setTimeout(resolve, delayMs))
        continue
      }
      throw err
    }
  }
}

async function fetchUserInfo(token, fromDate, toDate) {
  const query = `
    query {
      viewer {
        id
        login
        createdAt
        repositories(ownerAffiliations: OWNER, privacy: PUBLIC, first: 100) {
          totalCount
          nodes {
            name
            stargazerCount
            languages(first: 10) {
              edges {
                size
                node {
                  name
                  color
                }
              }
            }
          }
        }
        contributionsCollection {
          contributionYears
        }
        lastYear: contributionsCollection(from: "${fromDate}", to: "${toDate}") {
          totalCommitContributions
          totalIssueContributions
          totalPullRequestContributions
        }
      }
    }
  `
  return graphqlQuery(token, query)
}

async function fetchAllTimeContributions(token, years) {
  let totalCommits = 0, totalIssues = 0, totalPRs = 0

  for (const year of years) {
    const from = `${year}-01-01T00:00:00Z`
    const to = `${year}-12-31T23:59:59Z`
    const query = `
      query {
        viewer {
          contributionsCollection(from: "${from}", to: "${to}") {
            totalCommitContributions
            totalIssueContributions
            totalPullRequestContributions
          }
        }
      }
    `
    const data = await graphqlQuery(token, query)
    const cc = data.viewer.contributionsCollection
    totalCommits += cc.totalCommitContributions
    totalIssues += cc.totalIssueContributions
    totalPRs += cc.totalPullRequestContributions
    console.log(`  ${year}: ${cc.totalCommitContributions} commits, ${cc.totalIssueContributions} issues, ${cc.totalPullRequestContributions} PRs`)
  }

  return { totalCommits, totalIssues, totalPRs }
}

async function fetchUserReposWithCommits(token, username, userId, since, languageColors) {
  const repos = []
  let cursor = null
  let hasNextPage = true
  
  while (hasNextPage) {
    const query = `
      query($username: String!, $cursor: String) {
        user(login: $username) {
          repositories(first: 100, after: $cursor, ownerAffiliations: OWNER, privacy: PUBLIC) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              name
              url
              defaultBranchRef {
                target {
                  ... on Commit {
                    history(since: "${since.toISOString()}", author: {id: "${userId}"}) {
                      totalCount
                    }
                  }
                }
              }
              languages(first: 10) {
                edges {
                  size
                  node {
                    name
                    color
                  }
                }
              }
            }
          }
        }
      }
    `
    
    const data = await graphqlQuery(token, query, { username, cursor })
    const repoNodes = data.user.repositories.nodes
    
    for (const repo of repoNodes) {
      const commitCount = repo.defaultBranchRef?.target?.history?.totalCount || 0
      if (commitCount > 0) {
        const totalLangSize = repo.languages.edges.reduce((sum, e) => sum + e.size, 0)
        const languages = repo.languages.edges.map(e => ({
          name: e.node.name,
          percentage: totalLangSize > 0 ? (e.size / totalLangSize) * 100 : 0,
          color: getLanguageColor(e.node.name, e.node.color, languageColors)
        }))
        
        repos.push({
          name: repo.name,
          url: repo.url,
          commits: commitCount,
          languages,
          additions: 0,
          deletions: 0
        })
      }
    }
    
    hasNextPage = data.user.repositories.pageInfo.hasNextPage
    cursor = data.user.repositories.pageInfo.endCursor
    console.log(`Fetched ${repos.length} repos with commits...`)
  }
  
  return repos
}

async function fetchRepoCommitStats(token, owner, repoName, userId, since) {
  let additions = 0
  let deletions = 0
  let cursor = null
  let hasNextPage = true
  
  while (hasNextPage) {
    const query = `
      query($owner: String!, $repoName: String!, $cursor: String) {
        repository(owner: $owner, name: $repoName) {
          defaultBranchRef {
            target {
              ... on Commit {
                history(first: 100, after: $cursor, since: "${since.toISOString()}", author: {id: "${userId}"}) {
                  pageInfo {
                    hasNextPage
                    endCursor
                  }
                  nodes {
                    additions
                    deletions
                  }
                }
              }
            }
          }
        }
      }
    `
    
    const data = await graphqlQuery(token, query, { owner, repoName, cursor })
    const history = data.repository?.defaultBranchRef?.target?.history
    
    if (!history) break
    
    for (const commit of history.nodes) {
      additions += commit.additions || 0
      deletions += commit.deletions || 0
    }
    
    hasNextPage = history.pageInfo.hasNextPage
    cursor = history.pageInfo.endCursor
  }
  
  return { additions, deletions }
}

function calculateTopLanguages(repos, topN = 5, languageColors) {
  const languageCommits = {}
  
  for (const repo of repos) {
    for (const lang of repo.languages) {
      if (!languageCommits[lang.name]) {
        languageCommits[lang.name] = {
          name: lang.name,
          weightedCommits: 0,
          color: lang.color
        }
      }
      languageCommits[lang.name].weightedCommits += repo.commits * (lang.percentage / 100)
    }
  }
  
  const sortedLanguages = Object.values(languageCommits)
    .sort((a, b) => b.weightedCommits - a.weightedCommits)
    .slice(0, topN)
  
  const totalWeightedCommits = sortedLanguages.reduce((sum, l) => sum + l.weightedCommits, 0)
  
  return sortedLanguages.map(lang => ({
    name: lang.name,
    percentage: totalWeightedCommits > 0 ? Math.round((lang.weightedCommits / totalWeightedCommits) * 100) : 0,
    color: getLanguageColor(lang.name, lang.color, languageColors)
  }))
}

function generateLanguageBadge(lang) {
  const encodedColor = encodeURIComponent(lang.color)
  const encodedMessage = encodeURIComponent(`${lang.name} ${lang.percentage}%`)
  return `![${lang.name}](https://img.shields.io/static/v1?style=flat-square&label=%E2%A0%80&color=555&labelColor=${encodedColor}&message=${encodedMessage})`
}

function generateLanguageBar(lang) {
  const percentage = Math.max(0, Math.min(100, Math.round(lang.percentage)))
  const barColor = lang.color.replace('#', '')
  const blockCount = Math.max(1, Math.round(percentage / 5))
  const blocks = encodeURIComponent('█'.repeat(blockCount))
  return `![${lang.name}](https://img.shields.io/badge/${blocks}-${barColor}?style=flat&label=&labelColor=555&color=${barColor})`
}

function processTemplate(template, data) {
  let result = template
  
  result = result.replace(/{{\s*USERNAME\s*}}/g, data.username)
  result = result.replace(/{{\s*ACCOUNT_AGE\s*}}/g, data.accountAge)
  result = result.replace(/{{\s*COMMITS\s*}}/g, formatNumber(data.totalCommitsLastYear))
  result = result.replace(/{{\s*TOTAL_COMMITS_LAST_YEAR\s*}}/g, formatNumber(data.totalCommitsLastYear))
  result = result.replace(/{{\s*TOTAL_COMMITS_ALL_TIME\s*}}/g, typeof data.totalCommitsAllTime === 'number' ? formatNumber(data.totalCommitsAllTime) : data.totalCommitsAllTime)
  result = result.replace(/{{\s*REPOS_OWNED\s*}}/g, formatNumber(data.reposOwned))
  result = result.replace(/{{\s*REPOS_OWNED_ALL_TIME\s*}}/g, formatNumber(data.reposOwned))
  result = result.replace(/{{\s*STARS_RECEIVED\s*}}/g, formatNumber(data.starsReceived))
  result = result.replace(/{{\s*STARS_ALL_TIME\s*}}/g, formatNumber(data.starsReceived))
  result = result.replace(/{{\s*TOTAL_ADDITIONS_LAST_YEAR\s*}}/g, `$\\color{Green}{\\textsf{+${formatNumber(data.totalAdditionsLastYear)}}}$`)
  result = result.replace(/{{\s*TOTAL_DELETIONS_LAST_YEAR\s*}}/g, `$\\color{Red}{\\textsf{-${formatNumber(data.totalDeletionsLastYear)}}}$`)
  result = result.replace(/{{\s*TOTAL_ISSUES_ALL_TIME\s*}}/g, formatNumber(data.totalIssuesAllTime))
  result = result.replace(/{{\s*TOTAL_PRS_ALL_TIME\s*}}/g, formatNumber(data.totalPRsAllTime))
  result = result.replace(/{{\s*TOTAL_ISSUES_LAST_YEAR\s*}}/g, formatNumber(data.totalIssuesLastYear))
  result = result.replace(/{{\s*TOTAL_PRS_LAST_YEAR\s*}}/g, formatNumber(data.totalPRsLastYear))
  result = result.replace(/{{\s*TOP_LANGUAGES_ROWS\s*}}/g, data.topLanguagesRows)
  
  const langTemplateMatch = result.match(/{{\s*LANGUAGE_TEMPLATE_START\s*}}([\s\S]*?){{\s*LANGUAGE_TEMPLATE_END\s*}}/)
  if (langTemplateMatch) {
    const langTemplate = langTemplateMatch[1].trim()
    const langBadges = data.topLanguages.map(lang => {
      let badge = langTemplate
      badge = badge.replace(/{{\s*LANG_NAME\s*}}/g, lang.name)
      badge = badge.replace(/{{\s*LANG_PERCENT\s*}}/g, lang.percentage)
      badge = badge.replace(/{{\s*LANG_COLOR\s*}}/g, lang.color)
      badge = badge.replace(/{{\s*LANG_BADGE\s*}}/g, generateLanguageBadge(lang))
      return badge
    }).join(' ')
    result = result.replace(/{{\s*LANGUAGE_TEMPLATE_START\s*}}[\s\S]*?{{\s*LANGUAGE_TEMPLATE_END\s*}}/, langBadges)
  }
  
  const repoTemplateMatch = result.match(/{{\s*REPO_TEMPLATE_START\s*}}([\s\S]*?){{\s*REPO_TEMPLATE_END\s*}}/)
  if (repoTemplateMatch) {
    const repoTemplate = repoTemplateMatch[1]
    const repoItems = data.topRepos.map(repo => {
      let item = repoTemplate.replace(/^\n/, '')
      item = item.replace(/{{\s*REPO_NAME\s*}}/g, repo.name)
      item = item.replace(/{{\s*REPO_URL\s*}}/g, repo.url)
      item = item.replace(/{{\s*REPO_COMMITS\s*}}/g, formatNumber(repo.commits))
      item = item.replace(/{{\s*REPO_ADDITIONS\s*}}/g, `$\\color{Green}{\\textsf{+${formatNumber(repo.additions)}}}$`)
      item = item.replace(/{{\s*REPO_DELETIONS\s*}}/g, `$\\color{Red}{\\textsf{-${formatNumber(repo.deletions)}}}$`)
      return item.trimEnd()
    }).join('\n')
    result = result.replace(/{{\s*REPO_TEMPLATE_START\s*}}[\s\S]*?{{\s*REPO_TEMPLATE_END\s*}}/, repoItems)
  }
  
  return result
}

async function main() {
  console.log('Starting stats generation...')
  
  const languageColors = await loadLanguageColors()
  
  const token = await getGitHubToken()
  console.log('GitHub token obtained')
  
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  const fromDate = oneYearAgo.toISOString()
  const toDate = new Date().toISOString()
  console.log(`Fetching commits since: ${fromDate}`)
  
  const userInfo = await fetchUserInfo(token, fromDate, toDate)
  const viewer = userInfo.viewer
  console.log(`Fetching stats for user: ${viewer.login}`)
  
  const accountCreatedAt = new Date(viewer.createdAt)
  const now = new Date()
  const accountAge = Math.floor((now - accountCreatedAt) / (365.25 * 24 * 60 * 60 * 1000))
  
  const years = viewer.contributionsCollection.contributionYears
  console.log(`Fetching all-time contributions for years: ${years.join(', ')}`)
  const allTime = await fetchAllTimeContributions(token, years)
  const totalCommitsAllTime = allTime.totalCommits
  const totalIssuesAllTime = allTime.totalIssues
  const totalPRsAllTime = allTime.totalPRs
  const totalCommitsLastYear = viewer.lastYear.totalCommitContributions
  const totalIssuesLastYear = viewer.lastYear.totalIssueContributions
  const totalPRsLastYear = viewer.lastYear.totalPullRequestContributions
  
  console.log(`All time - Commits: ${totalCommitsAllTime}, Issues: ${totalIssuesAllTime}, PRs: ${totalPRsAllTime}`)
  console.log(`Last year - Commits: ${totalCommitsLastYear}, Issues: ${totalIssuesLastYear}, PRs: ${totalPRsLastYear}`)
  
  const reposWithCommits = await fetchUserReposWithCommits(token, viewer.login, viewer.id, oneYearAgo, languageColors)
  console.log(`Found ${reposWithCommits.length} repos with commits in the last year`)
  
  const topLanguages = calculateTopLanguages(reposWithCommits, 5, languageColors)
  console.log(`Top languages: ${topLanguages.map(l => `${l.name} (${l.percentage}%)`).join(', ')}`)
  
  const topRepos = reposWithCommits
    .sort((a, b) => b.commits - a.commits)
    .slice(0, 5)
  
  console.log('Fetching additions/deletions for top repos...')
  let totalAdditionsLastYear = 0
  let totalDeletionsLastYear = 0
  
  for (const repo of topRepos) {
    console.log(`  Fetching stats for ${repo.name}...`)
    const stats = await fetchRepoCommitStats(token, viewer.login, repo.name, viewer.id, oneYearAgo)
    repo.additions = stats.additions
    repo.deletions = stats.deletions
    totalAdditionsLastYear += stats.additions
    totalDeletionsLastYear += stats.deletions
    console.log(`    +${stats.additions} / -${stats.deletions} lines`)
  }
  
  console.log(`Total additions: ${totalAdditionsLastYear}, Total deletions: ${totalDeletionsLastYear}`)
  console.log(`Top repos: ${topRepos.map(r => `${r.name} (${r.commits})`).join(', ')}`)
  
  const starsReceived = viewer.repositories.nodes.reduce((sum, r) => sum + r.stargazerCount, 0)
  
  const statsData = {
    username: viewer.login,
    accountAge,
    totalCommitsLastYear,
    totalCommitsAllTime,
    reposOwned: viewer.repositories.totalCount,
    starsReceived,
    totalAdditionsLastYear,
    totalDeletionsLastYear,
    totalIssuesAllTime,
    totalPRsAllTime,
    totalIssuesLastYear,
    totalPRsLastYear,
    topLanguages,
    topLanguagesRows: (() => {
      const rows = []
      const allTimeRows = [
        `📦 **${formatNumber(viewer.repositories.totalCount)}** public repos`,
        `🔥 **${formatNumber(totalCommitsAllTime)}** commits`,
        `📋 **${formatNumber(totalIssuesAllTime)}** issues`,
        `🔀 **${formatNumber(totalPRsAllTime)}** PRs`,
        `⭐ **${formatNumber(starsReceived)}** stars`
      ]
      const lastYearRows = [
        `🔥 **${formatNumber(totalCommitsLastYear)}** commits`,
        `📝 **${formatNumber(totalIssuesLastYear)}** issues`,
        `🔀 **${formatNumber(totalPRsLastYear)}** PRs`,
        `${`$\\color{Green}{\\textsf{+${formatNumber(totalAdditionsLastYear)}}}$`} lines added`,
        `${`$\\color{Red}{\\textsf{-${formatNumber(totalDeletionsLastYear)}}}$`} lines removed`
      ]

      for (let i = 0; i < 5; i++) {
        const lang = topLanguages[i]
        const langCell = lang ? `${generateLanguageBadge(lang)} ${generateLanguageBar(lang)}` : ''
        rows.push(`| ${allTimeRows[i]} | ${lastYearRows[i]} | ${langCell} |`)
      }
      return rows.join('\n')
    })(),
    topRepos
  }
  
  const templatePath = path.join(__dirname, 'TEMPLATE.md')
  let template = ''
  
  try {
    template = fs.readFileSync(templatePath, 'utf-8')
    console.log('Template loaded from TEMPLATE.md')
  } catch (e) {
    console.log('No TEMPLATE.md found, using default template')
    template = `# Hi there, I'm {{ USERNAME }} 👋

[![Account Age](https://img.shields.io/static/v1?style=flat-square&label=GitHub&color=555&labelColor=181717&message={{ ACCOUNT_AGE }}%20years)](https://github.com/{{ USERNAME }})

## 📊 Stats for the last year

- 🔥 **{{ TOTAL_COMMITS_LAST_YEAR }}** commits
- 📦 **{{ REPOS_OWNED }}** repositories
- ⭐ **{{ STARS_ALL_TIME }}** stars received
- 📈 **+{{ TOTAL_ADDITIONS_LAST_YEAR }}** / **-{{ TOTAL_DELETIONS_LAST_YEAR }}** lines

## 📝 Top Languages

{{ LANGUAGE_TEMPLATE_START }}
{{ LANG_BADGE }} 
{{ LANGUAGE_TEMPLATE_END }}

## 🚀 Top Repositories

{{ REPO_TEMPLATE_START }}
- [{{ REPO_NAME }}]({{ REPO_URL }}) - {{ REPO_COMMITS }} commits (+{{ REPO_ADDITIONS }} / -{{ REPO_DELETIONS }})
{{ REPO_TEMPLATE_END }}
`
  }
  
  const readme = processTemplate(template, statsData)
  
  const readmePath = path.join(__dirname, 'README.md')
  fs.writeFileSync(readmePath, readme)
  console.log(`README.md generated at ${readmePath}`)
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
