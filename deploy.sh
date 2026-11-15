#!/bin/sh
# Redeploy; https://alarzah.vercel.app follows the latest production build automatically.
cd "$(dirname "$0")" && vercel deploy --prod --yes --scope ashfaques-projects-f955ce95
