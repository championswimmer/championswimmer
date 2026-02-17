#!/usr/bin/env node

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

async function getGitHubToken() {
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

async function graphqlQuery(token, query, variables = {}) {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })
  
  const data = await response.json()
  if (data.errors) {
    throw new Error(`GraphQL Error: ${JSON.stringify(data.errors)}`)
  }
  return data.data
}

async function fetchUserInfo(token) {
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
      }
    }
  `
  return graphqlQuery(token, query)
}

async function fetchUserReposWithCommits(token, username, userId, since) {
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
          color: e.node.color || LANGUAGE_COLORS[e.node.name] || LANGUAGE_COLORS.Default
        }))
        
        repos.push({
          name: repo.name,
          url: repo.url,
          commits: commitCount,
          languages
        })
      }
    }
    
    hasNextPage = data.user.repositories.pageInfo.hasNextPage
    cursor = data.user.repositories.pageInfo.endCursor
    console.log(`Fetched ${repos.length} repos with commits...`)
  }
  
  return repos
}

function calculateTopLanguages(repos, topN = 5) {
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
    color: lang.color || LANGUAGE_COLORS[lang.name] || LANGUAGE_COLORS.Default
  }))
}

function generateLanguageBadge(lang) {
  const encodedColor = encodeURIComponent(lang.color)
  const encodedMessage = encodeURIComponent(`${lang.name} ${lang.percentage}%`)
  return `![${lang.name}](https://img.shields.io/static/v1?style=flat-square&label=%E2%A0%80&color=555&labelColor=${encodedColor}&message=${encodedMessage})`
}

function processTemplate(template, data) {
  let result = template
  
  result = result.replace(/{{\s*USERNAME\s*}}/g, data.username)
  result = result.replace(/{{\s*ACCOUNT_AGE\s*}}/g, data.accountAge)
  result = result.replace(/{{\s*COMMITS\s*}}/g, data.totalCommits)
  result = result.replace(/{{\s*REPOS_OWNED\s*}}/g, data.reposOwned)
  result = result.replace(/{{\s*STARS_RECEIVED\s*}}/g, data.starsReceived)
  
  const langTemplateMatch = result.match(/{{\s*LANGUAGE_TEMPLATE_START\s*}}([\s\S]*?){{\s*LANGUAGE_TEMPLATE_END\s*}}/)
  if (langTemplateMatch) {
    const langTemplate = langTemplateMatch[1]
    const langBadges = data.topLanguages.map(lang => {
      let badge = langTemplate
      badge = badge.replace(/{{\s*LANG_NAME\s*}}/g, lang.name)
      badge = badge.replace(/{{\s*LANG_PERCENT\s*}}/g, lang.percentage)
      badge = badge.replace(/{{\s*LANG_COLOR\s*}}/g, lang.color)
      badge = badge.replace(/{{\s*LANG_BADGE\s*}}/g, generateLanguageBadge(lang))
      return badge
    }).join('')
    result = result.replace(/{{\s*LANGUAGE_TEMPLATE_START\s*}}[\s\S]*?{{\s*LANGUAGE_TEMPLATE_END\s*}}/, langBadges)
  }
  
  const repoTemplateMatch = result.match(/{{\s*REPO_TEMPLATE_START\s*}}([\s\S]*?){{\s*REPO_TEMPLATE_END\s*}}/)
  if (repoTemplateMatch) {
    const repoTemplate = repoTemplateMatch[1]
    const repoItems = data.topRepos.map(repo => {
      let item = repoTemplate
      item = item.replace(/{{\s*REPO_NAME\s*}}/g, repo.name)
      item = item.replace(/{{\s*REPO_URL\s*}}/g, repo.url)
      item = item.replace(/{{\s*REPO_COMMITS\s*}}/g, repo.commits)
      return item
    }).join('')
    result = result.replace(/{{\s*REPO_TEMPLATE_START\s*}}[\s\S]*?{{\s*REPO_TEMPLATE_END\s*}}/, repoItems)
  }
  
  return result
}

async function main() {
  console.log('Starting stats generation...')
  
  const token = await getGitHubToken()
  console.log('GitHub token obtained')
  
  const userInfo = await fetchUserInfo(token)
  const viewer = userInfo.viewer
  console.log(`Fetching stats for user: ${viewer.login}`)
  
  const accountCreatedAt = new Date(viewer.createdAt)
  const now = new Date()
  const accountAge = Math.floor((now - accountCreatedAt) / (365.25 * 24 * 60 * 60 * 1000))
  
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  console.log(`Fetching commits since: ${oneYearAgo.toISOString()}`)
  
  const reposWithCommits = await fetchUserReposWithCommits(token, viewer.login, viewer.id, oneYearAgo)
  console.log(`Found ${reposWithCommits.length} repos with commits in the last year`)
  
  const totalCommits = reposWithCommits.reduce((sum, r) => sum + r.commits, 0)
  console.log(`Total commits in last year: ${totalCommits}`)
  
  const topLanguages = calculateTopLanguages(reposWithCommits, 5)
  console.log(`Top languages: ${topLanguages.map(l => `${l.name} (${l.percentage}%)`).join(', ')}`)
  
  const topRepos = reposWithCommits
    .sort((a, b) => b.commits - a.commits)
    .slice(0, 5)
  console.log(`Top repos: ${topRepos.map(r => `${r.name} (${r.commits})`).join(', ')}`)
  
  const starsReceived = viewer.repositories.nodes.reduce((sum, r) => sum + r.stargazerCount, 0)
  
  const statsData = {
    username: viewer.login,
    accountAge,
    totalCommits,
    reposOwned: viewer.repositories.totalCount,
    starsReceived,
    topLanguages,
    topRepos
  }
  
  const fs = require('fs')
  const path = require('path')
  
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

- 🔥 **{{ COMMITS }}** commits
- 📦 **{{ REPOS_OWNED }}** repositories
- ⭐ **{{ STARS_RECEIVED }}** stars received

## 📝 Top Languages

{{ LANGUAGE_TEMPLATE_START }}
{{ LANG_BADGE }} 
{{ LANGUAGE_TEMPLATE_END }}

## 🚀 Top Repositories

{{ REPO_TEMPLATE_START }}
- [{{ REPO_NAME }}]({{ REPO_URL }}) - {{ REPO_COMMITS }} commits
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
