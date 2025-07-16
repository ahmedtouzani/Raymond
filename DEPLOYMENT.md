# Deployment Guide for bot-hosting.net

## Prerequisites
- Node.js 16.x or higher
- npm or yarn
- Git

## Deployment Steps

1. **Upload Your Bot**
   - Compress your bot files into a ZIP file
   - Upload the ZIP file to bot-hosting.net
   - Extract the files in the root directory

2. **Install Dependencies**
   - Run `npm install --production` to install only production dependencies

3. **Environment Variables**
   - Set up the following environment variables in your bot-hosting.net dashboard:
     - `DISCORD_TOKEN`: Your Discord bot token
     - `DATABASE_URL`: Your PostgreSQL connection string
     - `NODE_ENV`: Set to `production`

4. **Start the Bot**
   - Set the start command to: `npm start`
   - Ensure the bot has the necessary file permissions

5. **Optional: Set Up Backups**
   - To enable automatic backups, set up a scheduled task to run:
     ```
     npm run backup:schedule
     ```
   - This will create daily backups and keep the last 7 days of backups

## Troubleshooting

- **Bot Not Starting**: Check the logs in the bot-hosting.net dashboard for any error messages.
- **Database Connection Issues**: Ensure your database allows connections from the bot-hosting.net IP addresses.
- **Missing Dependencies**: Run `npm install` to ensure all dependencies are installed.

## Support

For additional help, please refer to the bot-hosting.net documentation or contact their support team.