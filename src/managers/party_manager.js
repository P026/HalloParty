import Parties from '../data_models/party';
import Users from '../data_models/user';
import Costumes from '../data_models/costume';
import Servers from '../data_models/server';
import { DiscordSnowflake } from '@sapphire/snowflake';
import cache from '../../utils/cache';
import { Collection } from 'discord.js';

class PartyManager {
  /**
   * @param { import('discord.js').Client } client
   * @param { import('../../utils/types').Webhooks } webhooks
   * @param { import('../../utils/types').Users } users
   * @param { [string] } channels
   */
  constructor(client, serverId, partyId, users, channels, webhooks) {
    this.serverId = serverId;
    this.client = client;
    this.partyId = partyId;
    this.users = users;
    this.channels = channels;
    this.webhooks = webhooks;
  }

  /**
   * @param { import('discord.js').Client } client
   */
  static async start(client, serverId, name) {
    let server = await Servers.findById(serverId);
    if (!server) {
      server = new Servers({ _id: serverId });
    }
    const partyId = DiscordSnowflake.generate().toString();
    const party = new Parties({
      _id: partyId,
      server_id: serverId,
      name,
    });
    server.parties.push(partyId);
    await server.save();
    await party.save();
    return new PartyManager(client, serverId, partyId);
  }

  static async fetchParties(serverId) {
    const parties = await Parties.find({ server_id: serverId });
    return parties.map(({ _id, name }) => ({ _id, name }));
  }

  static async isPartyChannel(client, channelId) {
    const partyId = cache.parties.findKey(party =>
      party.channels.some(id => channelId === id)
    );
    if (partyId) {
      console.log('cache hit');
      return partyId;
    }
    if (cache.non_party_channels.includes(channelId)) {
      console.log('cache hit 2');
      return false;
    }
    console.log('cache miss');
    const party = await Parties.findOne({ channels: channelId });
    if (!party) {
      cache.non_party_channels.push(channelId);
      return false;
    }

    await cacheParty(client, party);
    return party._id;
  }

  static async fetchParty(client, partyId) {
    const partyCache = cache.parties.get(partyId);
    if (partyCache) {
      console.log('cache hit');
      return new PartyManager(
        client,
        partyCache.server_id,
        partyCache._id,
        partyCache.users,
        partyCache.channels,
        partyCache.webhooks
      );
    }
    console.log('cache miss');
    const party = await Parties.findById(partyId);
    if (!party) return asyncError('Party doesnt exist');
    const p = await cacheParty(client, party);
    return new PartyManager(
      client,
      p.server_id,
      p._id,
      p.users,
      p.channels,
      p.webhooks
    );
  }

  async addPlayer(userid) {
    if (!this.partyId)
      return asyncError('use start method only to instantiate the manager');

    const party = await Parties.findById(this.partyId);
    if (!party)
      return asyncError('this shouldnt have occured but party doesnt exist');

    const user = await Users.findById(userid);
    if (!user) return asyncError('User needs to get started');

    const guild = await this.client.guilds.fetch(party.server_id);
    const evRole = await guild.roles.fetch(guild.id);

    let halloCategory = guild.channels.cache.find(
      chan => chan.type === 4 && chan.name === 'HalloParty'
    );

    if (!halloCategory) {
      halloCategory = await guild.channels.create({
        name: 'HalloParty',
        reason: 'halloparty',
        type: 4,
      });
    }

    const channel = await guild.channels.create({
      name: `${Date.now()}`,
      reason: 'halloparty',
      parent: halloCategory,
      permissionOverwrites: [
        { id: evRole, deny: 'ViewChannel' },
        { id: userid, allow: 'ViewChannel' },
      ],
    });
    const webhook = await channel.createWebhook({ name: 'HalloParty' });

    user.party_id = this.partyId;
    user.secret_webhook_id = webhook.id;
    party.users.push(userid);
    party.channels.push(channel.id);
    await user.save();
    await party.save();
    return channel;
  }

  async send(userid, message) {
    if (!this.webhooks)
      return asyncError(
        'instantiate the PartyManager using the fetchParty method'
      );
    const username = this.users.get(userid)?.clone_name;
    const costumeId = this.users.get(userid)?.costume_id;
    const costume = await Costumes.findById(costumeId);

    this.webhooks
      .filter((_webhook, uid) => uid !== userid)
      .each(async function (webhook) {
        webhook.send({
          username: username || 'default',
          avatarURL: costume?.img_src,
          content: message,
        });
      });
  }

  async removePlayer(_userid) {}

  async removeParty() {}
}

/**
 * @param { import('discord.js').Client } client
 */
async function cacheParty(client, party) {
  const users = await Users.find({ _id: { $in: party.users } });
  const userWebhooks = users.map(user => ({
    userid: user._id,
    whId: user.secret_webhook_id,
  }));
  const webhooks = new Collection();
  for (let uwh of userWebhooks) {
    const webhook = await client.fetchWebhook(uwh.whId);
    if (!webhook) continue;
    webhooks.set(uwh.userid, webhook);
  }

  const p = {
    _id: party._id,
    server_id: party.server_id,
    channels: party.channels,
    users: new Collection(users.map(user => [user._id, user])),
    webhooks: webhooks,
  };
  cache.parties.set(party._id, p);
  return p;
}

function asyncError(message) {
  return Promise.reject(new Error(message));
}

export default PartyManager;
