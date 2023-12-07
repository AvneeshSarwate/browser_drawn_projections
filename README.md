To build for github pages:
- follow steps here https://dev.to/shashannkbawa/deploying-vite-app-to-github-pages-3ane
- rename the `/dist` directory to `/docs` so that you can select it as the github pages directory
- in `/docs/index.html` change the URIs from absolute to relative


To configure for netlify and have vue-router work:
- remeber the _redirects file for netlify https://docs.netlify.com/routing/redirects/
- https://stackoverflow.com/a/53337147