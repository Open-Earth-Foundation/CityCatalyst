# api-demo

This is a demo single-page app (SPA) client for the CityCatalyst API.

It shows how to get an access token for the CityCatalyst API through OAuth 2.0, and use the token to call an API endpoint (the trivial "who am i" endpoint).

## Setup

1. Copy `public/config.js.example` to `public/config.js`.
2. Set the `CC_ORIGIN` property of `public/config.js` to the origin (no trailing slash) of the
   CityCatalyst server you're using. Common values: "http://localhost:3000" (developer workstation),
   "https://citycatalyst.openearth.dev" (dev server), "https://citycatalyst-test.openearth.dev" (test server), "https://citycatalyst.io" (prod server)
3. On the CityCatalyst server, go to the admin panel ("Admin" in the user drop down menu in the top right corner), and then select the "OAuth 2.0 Clients" tab.
4. Click the "Add Client" button. Use whatever you want for the "name" and "description". For the redirect URI, use the root URL of the server where you are deploying this file. If you're running it locally, put "http://localhost:2000/", including the trailing slash.
5. Get the client ID that CityCatalyst returns when you add the client, and add it to your config.js.
6. (Optional) Deploy the `public` sub-directory to whichever server you want. If you want to run
   it locally, and you have Docker, try this command in the `api-demo` directory, which runs an Nginx Docker image listening on port 2000:

```sh
docker run --rm -it \
  -v "$(pwd)/public":/usr/share/nginx/html:ro \
  -p 2000:80 \
  nginx:alpine
```

## Code

All of the code is in the HTML file. It uses the `oauth4webapi` library for the OAuth authorization
and for calling the API.
