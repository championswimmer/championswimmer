# Hi there, I'm {{ USERNAME }} 👋

Joined Github **{{ ACCOUNT_AGE }}** years ago.

In the last year I pushed **{{ COMMITS }}** commits. I have **{{ STARS_RECEIVED }}** stars across **{{ REPOS_OWNED }}** personal projects.

Most used languages across my projects:

{{ LANGUAGE_TEMPLATE_START }}
{{ LANG_BADGE }}
{{ LANGUAGE_TEMPLATE_END }}

## Top 5 Repositories

{{ REPO_TEMPLATE_START }}
- [{{ REPO_NAME }}]({{ REPO_URL }}) - {{ REPO_COMMITS }} commits
{{ REPO_TEMPLATE_END }}
