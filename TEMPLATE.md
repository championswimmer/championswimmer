# Hi there, I'm {{ USERNAME }} 👋

Joined Github **{{ ACCOUNT_AGE }}** years ago.

## 📊 Stats

| All Time | Last Year |
|----------|-----------|
| 📦 **{{ REPOS_OWNED_ALL_TIME }}** public repos | 🔥 **{{ COMMITS }}** commits |
| 🔥 **{{ TOTAL_COMMITS_ALL_TIME }}** commits | 📝 **{{ TOTAL_ISSUES_LAST_YEAR }}** issues |
| 📋 **{{ TOTAL_ISSUES_ALL_TIME }}** issues | 🔀 **{{ TOTAL_PRS_LAST_YEAR }}** PRs |
| 🔀 **{{ TOTAL_PRS_ALL_TIME }}** PRs | {{ TOTAL_ADDITIONS_LAST_YEAR }} lines added |
| ⭐ **{{ STARS_ALL_TIME }}** stars | {{ TOTAL_DELETIONS_LAST_YEAR }} lines removed |

## 📝 Top Languages (Last Year)

{{ LANGUAGE_TEMPLATE_START }}{{ LANG_BADGE }} {{ LANGUAGE_TEMPLATE_END }}

## 🚀 Most Active Projects (Last Year)

{{ REPO_TEMPLATE_START }}
- [{{ REPO_NAME }}]({{ REPO_URL }}) - {{ REPO_COMMITS }} commits, {{ REPO_ADDITIONS }} / {{ REPO_DELETIONS }}
{{ REPO_TEMPLATE_END }}
