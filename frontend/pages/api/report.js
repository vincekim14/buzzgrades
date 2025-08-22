import { MessageBuilder, Webhook } from "discord-webhook-node";

const hook = new Webhook(process.env.DISCORD_WEBHOOK);

export default async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { body } = req;
  const { url, email, source } = body;

  // Input validation
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'Missing or invalid URL' });
    return;
  }

  if (email && (!email.match(/^[a-zA-Z0-9._%+-]+$/) || email.length > 50)) {
    res.status(400).json({ error: 'Invalid email format' });
    return;
  }

  // Check if Discord webhook is configured
  if (!process.env.DISCORD_WEBHOOK) {
    res.status(500).json({ error: 'Discord webhook not configured' });
    return;
  }

  try {
    const baseURL = process.env.NEXT_PUBLIC_BASE_URL || 'https://buzzgrades.org';
    
    const embed = new MessageBuilder()
      .setTitle(`Missing URL: ${baseURL}${url}`)
      .setDescription(
        `Reported by ${email ? `${email}@gatech.edu` : "unknown"} on the ${
          source ?? "??"
        }`
      )
      .setColor(0x5b0013)
      .setTimestamp();

    await hook.send(embed);
    res.status(200).json({ message: "Success" });
  } catch (error) {
    console.error('Discord webhook error:', error);
    res.status(500).json({ error: 'Failed to send report' });
  }
};
