const { createEmbed } = require('../../utils/embed');
const { version: djsVersion } = require('discord.js');
const { version: nodeVersion } = process;
const os = require('os');
const { execSync } = require('child_process');
const packageJson = require('../../../package.json');

// Helper: Format bytes to human-readable format
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Helper: Format uptime
function formatUptime(seconds) {
  const days = Math.floor(seconds / (3600 * 24));
  const hours = Math.floor((seconds % (3600 * 24)) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}

// Helper: Get CPU usage (async)
async function getCpuUsage() {
  const startUsage = process.cpuUsage();
  const startTime = process.hrtime();

  return new Promise(resolve => {
    setTimeout(() => {
      const endUsage = process.cpuUsage(startUsage);
      const endTime = process.hrtime(startTime);

      const totalTime = endTime[0] * 1e6 + endTime[1] / 1e3;
      const totalCpuTime = endUsage.user + endUsage.system;
      const cpuPercent = (totalCpuTime / totalTime) * 100;

      resolve(cpuPercent.toFixed(1));
    }, 1000);
  });
}

// Helper: Get system-wide CPU usage
function getSystemCpuLoad() {
  return os.loadavg()[0].toFixed(2); // 1-minute load average
}

// Helper: Get available disk space
function getDiskUsage() {
  try {
    const output = execSync('df -h /').toString().split('\n')[1].split(/\s+/);
    return `Used: ${output[2]}, Free: ${output[3]}`;
  } catch {
    return 'Not available';
  }
}

// Helper: Get git commit hash
function getGitCommit() {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'Not available';
  }
}

module.exports = {
  name: 'botinfo',
  aliases: ['stats', 'bot', 'info'],
  description: 'Displays detailed information and statistics about the bot',
  category: 'Utility',
  cooldown: 10,
  prefixless: true,

  async execute(message, args, client) {
    // Check if the command user is the bot owner
    if (message.author.id !== '716381717589393499') {
      return message.reply({ content: '❌ This command is restricted to the bot owner only.' });
    }

    // Calculate memory usage
    const { heapUsed, heapTotal } = process.memoryUsage();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;

    // Get CPU usage
    const cpuUsage = await getCpuUsage();

    // Get bot stats
    const guilds = client.guilds.cache.size;
    const channels = client.channels.cache.size;
    const users = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
    const commands = client.commands.size;
    const ping = client.ws.ping;
    const uptime = process.uptime();
    const osUptime = os.uptime();

    // Get git info if available
    const commitHash = getGitCommit();

    // Detect active shards
    const shards = client.options.shards?.length ? client.options.shards.length : 'Single';

    // Create base embed
    const embed = await createEmbed(message.guild?.id, {
      author: {
        name: `${client.user.username} Statistics`,
        iconURL: client.user.displayAvatarURL({ dynamic: true, format: 'png' })
      },
      fields: [
        {
          name: '<:3736prmanager:1379103192784310282> Bot Stats',
          value: [
            `<:arrow:1309167079231848572> **Servers:** ${guilds.toLocaleString()}`,
            `<:arrow:1309167079231848572> **Users:** ${users.toLocaleString()}`,
            `<:arrow:1309167079231848572> **Channels:** ${channels.toLocaleString()}`,
            `<:arrow:1309167079231848572> **Commands:** ${commands.toLocaleString()}`,
            `<:arrow:1309167079231848572> **Ping:** ${ping}ms`,
            `<:arrow:1309167079231848572> **Uptime:** ${formatUptime(uptime)}`,
            `<:arrow:1309167079231848572> **Shards:** ${shards}`
          ].join('\n'),
          inline: true
        },
        {
          name: '<:3736prmanager:1379103192784310282> System',
          value: [
            `<:arrow:1309167079231848572> **CPU:** ${os.cpus()[0].model}`,
            `<:arrow:1309167079231848572> **Logical Cores:** ${os.cpus().length}`,
            `<:arrow:1309167079231848572> **CPU Load:** ${getSystemCpuLoad()}%`,
            `<:arrow:1309167079231848572> **Bot CPU Usage:** ${cpuUsage}%`,
            `<:arrow:1309167079231848572> **Memory:** ${formatBytes(usedMemory)} / ${formatBytes(totalMemory)}`,
            `<:arrow:1309167079231848572> **Heap:** ${formatBytes(heapUsed)} / ${formatBytes(heapTotal)}`,
            `<:arrow:1309167079231848572> **Disk Usage:** ${getDiskUsage()}`,
            `<:arrow:1309167079231848572> **Platform:** ${os.platform()} (${os.arch()})`,
            `<:arrow:1309167079231848572> **OS Uptime:** ${formatUptime(osUptime)}`
          ].join('\n'),
          inline: true
        },
        {
          name: '<:3736prmanager:1379103192784310282> Versions',
          value: [
            `<:arrow:1309167079231848572> **Bot:** v${packageJson.version}`,
            `<:arrow:1309167079231848572> **Discord.js:** v${djsVersion}`,
            `<:arrow:1309167079231848572> **Commit:** ${commitHash}`,
            `**<:arrow:1309167079231848572> Last Restart:** <t:${Math.floor((Date.now() - (uptime * 1000)) / 1000)}:R>`
          ].join('\n'),
          inline: false
        }
      ],
      footer: {
        text: `Requested by ${message.author.tag}`,
        iconURL: message.author.displayAvatarURL({ dynamic: true, format: 'png' })
      },
      timestamp: true,
      color: message.guild?.members.me?.displayColor || 0x5865F2
    });

    // Set thumbnail after creating the embed
    const botAvatar = client.user.displayAvatarURL({ size: 1024, format: 'png' });
    if (botAvatar) {
      embed.setThumbnail(botAvatar);
    }

    return message.reply({ embeds: [embed] });
  }
};