# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## LinkedIn publishing setup

The LinkedIn **Connect** button requires server-side OAuth credentials. Create a
LinkedIn app in the [LinkedIn Developer Portal](https://www.linkedin.com/developers/apps),
then enable both **Sign in with LinkedIn using OpenID Connect** and **Share on
LinkedIn**. The latter provides the `w_member_social` permission required to
publish posts.

In the app's **Auth** settings, register this redirect URL for each deployed
environment:

```text
https://<your-app-domain>/api/public/oauth/linkedin
```

Add the following values to encrypted server environment settings in Lovable
Cloud (or your production host), then redeploy:

```text
LINKEDIN_CLIENT_ID=<LinkedIn Client ID>
LINKEDIN_CLIENT_SECRET=<LinkedIn Client Secret>
OAUTH_STATE_SECRET=<long random secret>
```

For local development, copy `.env.example` to `.env` and supply the same
values. Never commit `.env` or expose `LINKEDIN_CLIENT_SECRET` to the browser.
After deployment, go to **Brand Profile → Channel connections → LinkedIn**, sign
in to the intended LinkedIn member account, and approve the requested access.
That OAuth account—not the profile URL saved under Channels & assets—is the
account that receives posts.

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS
