const {
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonStyle,
  ButtonBuilder,
  StringSelectMenuOptionBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  ComponentType,
  bold,
  userMention,
  italic
} = require('discord.js');
const mongoose = require('mongoose');

const User = require('../models/user.js');
const Duel = require('../models/duel.js');
const Death = require('../models/death.js');
const {
  rooms,
  duel_bounds,
  duel_texts,
  armor_texts,
  weapon_texts,
  BASE_DAMAGE,
  armors,
  weapons
} = require('../constants');
const { client } = require('../client');
const { randoms } = require('../constants');

const createEmbed = (user) => {
  return new EmbedBuilder().setTitle('Welcome to the game!').addFields(
    {
      name: 'Health Points',
      value: `${user.health_points}/100`,
      inline: true
    },
    { name: 'Attack Power', value: `${user.attack_power}`, inline: true },
    { name: 'Energy Points', value: `${user.energy_points}/3`, inline: true },
    {
      name: '<:zpintop:1129374515365945364> Credit',
      value: `${user.gold}`,
      inline: true
    },
    {
      name: 'Repair Kit Cost',
      value: `${user.health_potion_cost}`,
      inline: true
    },
    { name: 'Weapon', value: user.weapon ?? 'None', inline: true },
    { name: 'Armor', value: user.armor ?? 'None', inline: true }
  );
};

const createNotificationEmbed = (title, description) =>
  new EmbedBuilder().setTitle(title).setDescription(description);

const createShopEmbed = (user) => {
  const weapons_shop = Object.values(weapons).map((weapon) => ({
    name: weapon.name,
    value: `Attack Power:${weapon.attack_power} Cost:${weapon.cost}`,
    inline: true
  }));
  const armors_shop = Object.values(armors).map((armor) => ({
    name: armor.name,
    value: `Damage Migration:${armor.dmg_migration} Cost:${armor.cost}`,
    inline: true
  }));
  return new EmbedBuilder()
    .setTitle('ARMORY')
    .setDescription('We have precious items!\n\n')
    .addFields(
      {
        name: 'Repair Kit',
        value: `${user.health_potion_cost}`
      },
      {
        name: '---------------------',
        value: bold('Weapons')
      },
      ...weapons_shop,
      {
        name: '---------------------',
        value: bold('Armors')
      },
      ...armors_shop
    );
};

const createRow = (custom_ids = ['status']) => {
  const buttons = {
    status: {
      customId: 'status',
      label: 'Main Menu',
      style: ButtonStyle.Primary
    },
    duel: {
      customId: 'duel',
      label: 'Battle',
      style: ButtonStyle.Danger
    },
    random_encounter: {
      customId: 'random_encounter',
      label: 'Random Encounter',
      style: ButtonStyle.Secondary
    },
    buying: {
      customId: 'buying',
      label: 'Buying',
      style: ButtonStyle.Success
    },
    buy_weapon: {
      customId: 'buy_weapon',
      label: 'Buy Weapon',
      style: ButtonStyle.Success
    },
    sell_weapon: {
      customId: 'sell_weapon',
      label: 'Sell Weapon',
      style: ButtonStyle.Danger
    },
    buy_armor: {
      customId: 'buy_armor',
      label: 'Buy Armor',
      style: ButtonStyle.Success
    },
    sell_armor: {
      customId: 'sell_armor',
      label: 'Sell Armor',
      style: ButtonStyle.Danger
    },
    buy_potion: {
      customId: 'buy_potion',
      label: 'Buy Repair Kit',
      style: ButtonStyle.Primary
    },
    shop: {
      customId: 'shop',
      label: 'Armory',
      style: ButtonStyle.Success
    },
    weapon_list: {
      customId: 'weapon_list',
      placeholder: 'Select a weapon',
      items: Object.entries(weapons).map(([key, value]) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(value.name)
          .setDescription(value.description)
          .setValue(key)
      )
    },
    armor_list: {
      customId: 'armor_list',
      placeholder: 'Select an armor',
      items: Object.entries(armors).map(([key, value]) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(value.name)
          .setDescription(value.description)
          .setValue(key)
      )
    }
  };

  return new ActionRowBuilder().addComponents(
    ...custom_ids.reduce((acc, id) => {
      const rowItem = buttons[id];
      if (['weapon_list', 'armor_list'].includes(id)) {
        acc.push(
          new StringSelectMenuBuilder()
            .setCustomId(rowItem.customId)
            .setPlaceholder(rowItem.placeholder)
            .addOptions(rowItem.items)
        );
      } else {
        acc.push(
          new ButtonBuilder()
            .setCustomId(rowItem.customId)
            .setLabel(rowItem.label)
            .setStyle(rowItem.style)
            .setEmoji('695955554199142421')
        );
      }
      return acc;
    }, [])
  );
};

const createExtraRows = (obj, key) => {
  if (!obj[key]) {
    if (key === 'shop') {
      obj[key] = createRow(['status', 'buying', 'sell_weapon', 'sell_armor']);
    } else if (key === 'buy_weapon') {
      obj[key] = createRow(['weapon_list']);
    } else if (key === 'buy_armor') {
      obj[key] = createRow(['armor_list']);
    } else if (key === 'buying') {
      obj[key] = createRow(['status', 'buy_potion', 'buy_weapon', 'buy_armor']);
    }
  }
};

const getChannel = async (channel_id) =>
  (await client.channels.cache.get(channel_id)) ||
  (await client.channels.fetch(channel_id));

const startDuel = async (
  session,
  user,
  i,
  embed,
  row,
  is_random_encounter = false
) => {
  const isUserDueled = await Duel.findOne({
    discord_id: i.user.id
  }).session(session);
  if (isUserDueled) {
    if (!is_random_encounter) {
      embed = createEmbed(user);
      await i.update({
        content: '',
        embeds: [
          createNotificationEmbed(
            'Hurray!',
            'You are already in battle queue!'
          ),
          embed
        ],
        components: [row],
        ephemeral: true
      });
    }
    return;
  }
  if (user.energy_points <= 0) {
    if (!is_random_encounter) {
      embed = createEmbed(user);
      await i.update({
        embeds: [
          createNotificationEmbed(
            'Oops!',
            'You do not have enough energy points!'
          ),
          embed
        ],
        components: [row],
        ephemeral: true
      });
    }
    return;
  }
  const isThereOtherPlayer = await Duel.findOneAndDelete(
    {
      discord_id: { $ne: i.user.id }
    },
    { session }
  ).sort({ doc_created_at: 1 });
  if (!isThereOtherPlayer) {
    const duel = new Duel({ discord_id: i.user.id });
    await duel.save({ session });
    if (!is_random_encounter) {
      embed = createEmbed(user);
      await i.update({
        content: '',
        embeds: [
          createNotificationEmbed(
            'Hurray!',
            'You have been added to battle queue!'
          ),
          embed
        ],
        components: [row],
        ephemeral: true
      });
      await User.findOneAndUpdate(
        { discord_id: i.user.id, energy_points: { $gt: 0 } },
        { $inc: { energy_points: -1 } },
        { session }
      );
    }
    return;
  }
  const otherDuelPlayer = await User.findOne({
    discord_id: isThereOtherPlayer.discord_id
  }).session(session);
  const playerRoll = Math.random();
  const otherPlayerRoll = Math.random();
  const playerDamage = parseFloat((playerRoll * user.attack_power).toFixed(2));
  const otherPlayerDamage = parseFloat(
    (otherPlayerRoll * otherDuelPlayer.attack_power).toFixed(2)
  );
  const isTie = playerDamage === otherPlayerDamage;
  if (isTie) {
    await Duel.deleteMany(
      {
        discord_id: { $in: [i.user.id, otherDuelPlayer.discord_id] }
      },
      { session }
    );
    if (!is_random_encounter) {
      await i.update({
        embeds: [createNotificationEmbed('Ooops!', 'It is a tie!'), embed],
        components: [row],
        ephemeral: true
      });
    }
    return;
  }
  const winner = playerDamage > otherPlayerDamage ? user : otherDuelPlayer;
  const loser = playerDamage > otherPlayerDamage ? otherDuelPlayer : user;
  const damageFloat =
    BASE_DAMAGE +
    Math.abs(playerDamage - otherPlayerDamage) *
      (1 - (loser.armor ? armors[loser.armor].dmg_migration : 0)) *
      10;
  loser.health_points = Math.round(loser.health_points - damageFloat);
  await loser.save({ session });
  const isLoserDead = loser.health_points <= 0;
  const perspective = ['getting_damage', 'damaging'][
    Math.floor(Math.random() * 2)
  ];
  const bound = duel_bounds.find(
    (b) => damageFloat >= b.lower_bound && damageFloat < b.upper_bound
  );
  const boundName = isLoserDead ? 'Elimination' : bound.name;
  const armor_text = loser.armor
    ? armor_texts.filter((a) => a['Armor'].includes(loser.armor.toUpperCase()))[
        Math.floor(Math.random() * 2)
      ][bound.name]
    : '';
  const weapon_text = winner.weapon
    ? weapon_texts.filter((w) =>
        w['Weapon'].includes(winner.weapon.toUpperCase())
      )[0][bound.name]
    : '';
  let armory_text = '';
  if (armor_text && weapon_text) {
    armory_text = [armor_text, weapon_text][Math.floor(Math.random() * 2)];
  } else if (armor_text) {
    armory_text = armor_text;
  } else if (weapon_text) {
    armory_text = weapon_text;
  }
  let duel_text = duel_texts.find((d) => d.name === boundName)[perspective];
  duel_text = isLoserDead
    ? `${armory_text}\n${duel_text}`
    : `${duel_text}\n${armory_text}`;
  // TODO: Add lost HP and lost gold to the duel text.
  // duel_text += `\n @kaybeden lost `
  duel_text = duel_text
    .replaceAll('@kazanan', userMention(winner.discord_id))
    .replaceAll('@kaybeden', userMention(loser.discord_id));
  const earnedGold = isLoserDead
    ? Math.floor(
        loser.gold +
          (loser.armor ? armors[loser.armor].cost : 0) +
          (loser.weapon ? weapons[loser.weapon].cost : 0)
      )
    : Math.floor(loser.gold / 2);
  winner.gold += earnedGold;

  if (isLoserDead) {
    const death = new Death({
      type: 'duel',
      discord_id: loser.discord_id,
      death_time: new Date()
    });
    await Promise.all([
      death.save({ session }),
      winner.save({ session }),
      Duel.deleteMany(
        {
          discord_id: { $in: [winner.discord_id, loser.discord_id] }
        },
        { session }
      )
    ]);
    if (!is_random_encounter) {
      await i.update({
        content: duel_text,
        embeds: [embed],
        components: [row],
        ephemeral: true
      });
    }
  } else {
    loser.gold -= earnedGold;
    await Promise.all([
      winner.save({ session }),
      loser.save({ session }),
      Duel.deleteMany(
        {
          discord_id: { $in: [winner.discord_id, loser.discord_id] }
        },
        { session }
      )
    ]);
    if (!is_random_encounter) {
      await i.update({
        content: duel_text,
        embeds: [embed],
        components: [row],
        ephemeral: true
      });
    }
  }
  const channel = await getChannel(rooms.feed);
  if (channel) {
    await Promise.all([
      User.findOneAndUpdate(
        { discord_id: i.user.id, energy_points: { $gt: 0 } },
        { $inc: { energy_points: -1 } },
        { session }
      ),
      channel.send(duel_text)
    ]);
  } else {
    await User.findOneAndUpdate(
      { discord_id: i.user.id, energy_points: { $gt: 0 } },
      { $inc: { energy_points: -1 } },
      { session }
    );
  }
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play the game!'),
  async execute(interaction) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
      }
      const user_global = await User.findOne({
        discord_id: interaction.user.id
      });
      if (!user_global) {
        await interaction.editReply({
          content:
            'You are not registered! Please use /register command to register.',
          ephemeral: true
        });
        return;
      }
      if (user_global.health_points <= 0) {
        await interaction.editReply({
          content: 'You have died. You cannot play anymore.',
          ephemeral: true
        });
        return;
      }
      // TODO: Get this from a global state.
      const isGameStarted = process.env.NODE_ENV !== 'production';
      if (!isGameStarted) {
        await interaction.editReply({
          content: 'The game has not started yet!',
          ephemeral: true
        });
        return;
      }
      let embed = createEmbed(user_global);
      const row = createRow(['status', 'duel', 'random_encounter', 'shop']);
      const extraRows = {};
      createExtraRows(extraRows, 'shop');
      const response = await interaction.editReply({
        embeds: [embed],
        components: [row],
        ephemeral: true
      });

      const collector = response.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 3_600_000
      });

      const selectMenuCollector = response.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 3_600_000
      });

      selectMenuCollector.on('collect', async (i) => {
        const session = await mongoose.startSession();
        try {
          await session.withTransaction(async () => {
            const user = await User.findOne({ discord_id: i.user.id }).session(
              session
            );
            if (user.health_points <= 0) {
              await i.update({
                content: 'You have died. You cannot play anymore.',
                embeds: [],
                components: [],
                ephemeral: true
              });
              throw new Error('User is dead.');
            }
            if (i.customId === 'weapon_list') {
              const weapon = weapons[i.values[0]];
              if (user.gold < weapon.cost) {
                await i.update({
                  embeds: [
                    createNotificationEmbed(
                      'Ooops!',
                      'You do not have enough gold.'
                    ),
                    createShopEmbed(user)
                  ],
                  components: [extraRows.shop],
                  ephemeral: true
                });
              } else {
                user.gold -= weapon.cost;
                user.weapon = weapon.name;
                user.attack_power += weapon.attack_power;
                await user.save({ session });
                await i.update({
                  embeds: [
                    createNotificationEmbed(
                      'Hurray!',
                      'You have bought a weapon!'
                    ),
                    createShopEmbed(user)
                  ],
                  components: [extraRows.shop],
                  ephemeral: true
                });
              }
            } else if (i.customId === 'armor_list') {
              const armor = armors[i.values[0]];
              if (user.gold < armor.cost) {
                await i.update({
                  embeds: [
                    createNotificationEmbed(
                      'Ooops!',
                      'You do not have enough gold.'
                    ),
                    createShopEmbed(user)
                  ],
                  components: [extraRows.shop],
                  ephemeral: true
                });
              } else {
                user.gold -= armor.cost;
                user.armor = armor.name;
                await user.save({ session });
                await i.update({
                  embeds: [
                    createNotificationEmbed(
                      'Hurray!',
                      'You have bought an armor!'
                    ),
                    createShopEmbed(user)
                  ],
                  components: [extraRows.shop],
                  ephemeral: true
                });
              }
            }
          });
        } catch (error) {
          // await session.abortTransaction();
          console.error('Transaction aborted:', error);
        } finally {
          await session.endSession();
        }
      });

      collector.on('collect', async (i) => {
        const session = await mongoose.startSession();
        try {
          await session.withTransaction(async () => {
            // TODO: Other users should not see other users' bot responses. Check this later.
            if (i.user.id !== interaction.user.id) {
              await i.reply({
                content: 'You are not allowed to use this button!',
                ephemeral: true
              });
              throw new Error('User is not allowed to use this button!');
            }
            const user = await User.findOne({
              discord_id: i.user.id,
              health_points: { $gt: 0 }
            }).session(session);
            if (!user) {
              await i.update({
                content: 'You have died. You cannot play anymore.',
                embeds: [],
                components: [],
                ephemeral: true
              });
              throw new Error('User is dead.');
            }
            if (i.customId === 'status') {
              try {
                embed = createEmbed(user);
                await i.update({
                  embeds: [embed],
                  components: [row],
                  ephemeral: true
                });
              } catch (err) {
                console.error(err);
                embed = createEmbed(user);
                await i.update({
                  embeds: [embed],
                  components: [row],
                  ephemeral: true
                });
              }
            } else if (i.customId === 'duel') {
              await startDuel(session, user, i, embed, row);
            } else if (i.customId === 'random_encounter') {
              if (user.energy_points <= 0) {
                embed = createEmbed(user);
                await i.update({
                  embeds: [
                    createNotificationEmbed(
                      'Oops!',
                      'You do not have enough energy points!'
                    ),
                    embed
                  ],
                  components: [row],
                  ephemeral: true
                });
                return;
              }
              user.energy_points = Math.max(0, user.energy_points - 1);
              const random_number = Math.floor(Math.random() * randoms.length);
              const random = randoms[random_number];
              const channel =
                (await client.channels.cache.get(rooms.feed)) ||
                (await client.channels.fetch(rooms.feed));
              if (random_number >= 0 && random_number <= 44) {
                const outcomes = random.outcome.split(',');
                const outcomesPrivate = [];
                const outcomesFeed = [];
                outcomes.forEach((outcome) => {
                  const out = outcome.trim().toLowerCase();
                  console.log(out);
                  if (out.includes('lost')) {
                    if (out.includes('hp')) {
                      const lost_hp = out.split(' ')[1].trim();
                      user.health_points -= parseInt(lost_hp);
                      const eliminated_text =
                        user.health_points <= 0 ? ' and eliminated' : '';
                      outcomesPrivate.push(
                        `You have lost ${lost_hp} health points${eliminated_text}.\n`
                      );
                      outcomesFeed.push(
                        `${userMention(
                          user.discord_id
                        )} has lost ${lost_hp} health points${eliminated_text}.\n`
                      );
                    } else if (out.includes('an ep')) {
                      user.energy_points = Math.max(0, user.energy_points - 1);
                      outcomesPrivate.push('You have lost an energy point.\n');
                      outcomesFeed.push(
                        `${userMention(
                          user.discord_id
                        )} has lost an energy point.\n`
                      );
                    } else if (out.includes('all ep')) {
                      user.energy_points = 0;
                      outcomesPrivate.push(
                        'You have lost all energy points.\n'
                      );
                      outcomesFeed.push(
                        `${userMention(
                          user.discord_id
                        )} has lost all energy points.\n`
                      );
                    } else if (out.includes('two eps')) {
                      user.energy_points = Math.max(0, user.energy_points - 2);
                      outcomesPrivate.push(
                        'You have lost two energy points.\n'
                      );
                      outcomesFeed.push(
                        `${userMention(
                          user.discord_id
                        )} has lost two energy points.\n`
                      );
                    } else if (out.includes('credits')) {
                      const lost_credits = out.split(' ')[1];
                      user.gold = Math.max(
                        0,
                        user.gold - parseInt(lost_credits)
                      );
                      outcomesPrivate.push(
                        `You have lost ${lost_credits} credits.\n`
                      );
                      outcomesFeed.push(
                        `${userMention(
                          user.discord_id
                        )} has lost ${lost_credits} credits.\n`
                      );
                    } else if (out.includes('armor')) {
                      if (user.armor) {
                        user.armor = null;
                        outcomesPrivate.push('You have lost your armor.\n');
                        outcomesFeed.push(
                          `${userMention(
                            user.discord_id
                          )} has lost their armor.\n`
                        );
                      } else {
                        const split_text_arr = out.split(' ');
                        const lost_credit =
                          split_text_arr[split_text_arr.length - 3];
                        user.gold = Math.max(
                          0,
                          user.gold - parseInt(lost_credit)
                        );
                        outcomesPrivate.push(
                          `You have lost ${lost_credit} credits because you don't have an armor.\n`
                        );
                        outcomesFeed.push(
                          `${userMention(
                            user.discord_id
                          )} has lost ${lost_credit} credits because they don't have an armor.\n`
                        );
                      }
                    } else if (out.includes('weapon')) {
                      if (user.weapon) {
                        user.weapon = null;
                        outcomesPrivate.push('You have lost your weapon.\n');
                        outcomesFeed.push(
                          `${userMention(
                            user.discord_id
                          )} has lost their weapon.\n`
                        );
                      } else {
                        const split_text_arr = out.split(' ');
                        const lost_credit =
                          split_text_arr[split_text_arr.length - 3];
                        user.gold = Math.max(
                          0,
                          user.gold - parseInt(lost_credit)
                        );
                        outcomesPrivate.push(
                          `You have lost ${lost_credit} credits because you don't have a weapon.\n`
                        );
                        outcomesFeed.push(
                          `${userMention(
                            user.discord_id
                          )} has lost ${lost_credit} credits because they don't have a weapon.\n`
                        );
                      }
                    }
                  } else if (out.includes('replaced')) {
                    if (out.includes('armor')) {
                      const armor = out
                        .split('replaced by a ')[1]
                        .replaceAll('\n', '')
                        .trim();
                      const armor_name = Object.values(armors).find(
                        (a) => a.name.toUpperCase() === armor.toUpperCase()
                      )?.name;
                      if (!armor_name) {
                        // prettier-ignore
                        throw new Error('Armor couldn\'t find');
                      }
                      user.armor = armor_name;
                      outcomesPrivate.push(
                        `Your armor has been replaced by a ${armor}.\n`
                      );
                      outcomesFeed.push(
                        `${userMention(
                          user.discord_id
                        )}’s armor has been replaced by a ${armor}.\n`
                      );
                    } else if (out.includes('weapon')) {
                      const weapon = out
                        .split('replaced by a ')[1]
                        .replaceAll('\n', '')
                        .trim();
                      const weapon_name = Object.values(weapons).find(
                        (a) => a.name.toUpperCase() === weapon.toUpperCase()
                      )?.name;
                      if (!weapon_name) {
                        // prettier-ignore
                        throw new Error('Weapon couldn\'t find');
                      }
                      user.weapon = weapon_name;
                      outcomesPrivate.push(
                        `Your weapon has been replaced by a ${weapon}.\n`
                      );
                      outcomesFeed.push(
                        `${userMention(
                          user.discord_id
                        )}’s weapon has been replaced by a ${weapon}.\n`
                      );
                    }
                  } else if (out.includes('eliminated')) {
                    user.health_points = 0;
                    outcomesPrivate.push('You have been eliminated.\n');
                    outcomesFeed.push(
                      `${userMention(user.discord_id)} has been eliminated.\n`
                    );
                  } else if (
                    out.includes('earned') &&
                    out.includes('credits')
                  ) {
                    const earned_credits = out.split(' ')[1];
                    user.gold += parseInt(earned_credits);
                    outcomesPrivate.push(
                      `You have earned ${earned_credits} credits.\n`
                    );
                    outcomesFeed.push(
                      `${userMention(
                        user.discord_id
                      )} has earned ${earned_credits} credits.\n`
                    );
                  } else if (out.includes('gained') && out.includes('hp')) {
                    const gained_hp = out.split(' ')[1].trim();
                    user.health_points += parseInt(gained_hp);
                    outcomesPrivate.push(
                      `You have gained ${gained_hp} health points.\n`
                    );
                    outcomesFeed.push(
                      `${userMention(
                        user.discord_id
                      )} has gained ${gained_hp} health points.\n`
                    );
                  } else if (out.includes('regenerated')) {
                    if (out.includes('an ep')) {
                      user.energy_points += 1;
                      outcomesPrivate.push(
                        'You have regenerated an energy point.\n'
                      );
                      outcomesFeed.push(
                        `${userMention(
                          user.discord_id
                        )} has regenerated an energy point.\n`
                      );
                    } else if (out.includes('two eps')) {
                      user.energy_points += 2;
                      outcomesPrivate.push(
                        'You have regenerated two energy points.\n'
                      );
                      outcomesFeed.push(
                        `${userMention(
                          user.discord_id
                        )} has regenerated two energy points.\n`
                      );
                    } else if (out.includes('all eps')) {
                      user.energy_points = 3;
                      outcomesPrivate.push(
                        'You have regenerated all energy points.\n'
                      );
                      outcomesFeed.push(
                        `${userMention(
                          user.discord_id
                        )} has regenerated all energy points.\n`
                      );
                    }
                  } else if (out.includes('upgraded')) {
                    if (out.includes('armor')) {
                      const armor = out
                        .replace('upgraded your armor to ', '')
                        .replaceAll('\n', '')
                        .trim();
                      const armor_name = Object.values(armors).find(
                        (a) => a.name.toUpperCase() === armor.toUpperCase()
                      )?.name;
                      if (!armor_name) {
                        // prettier-ignore
                        throw new Error('Armor couldn\'t find');
                      }
                      user.armor = armor_name;
                      outcomesPrivate.push(
                        `Your armor has been upgraded to ${armor}.\n`
                      );
                      outcomesFeed.push(
                        `${userMention(
                          user.discord_id
                        )}’s armor has been upgraded to ${armor}.\n`
                      );
                    } else if (out.includes('weapon')) {
                      const weapon = out
                        .replace('upgraded your weapon to ', '')
                        .trim()
                        .replaceAll('\n', '');
                      const weapon_name = Object.values(weapons).find(
                        (a) => a.name.toUpperCase() === weapon.toUpperCase()
                      )?.name;
                      if (!weapon_name) {
                        // prettier-ignore
                        throw new Error('Weapon couldn\'t find');
                      }
                      user.weapon = weapon_name;
                      outcomesPrivate.push(
                        `Your weapon has been upgraded to ${weapon}.\n`
                      );
                      outcomesFeed.push(
                        `${userMention(
                          user.discord_id
                        )}’s weapon has been upgraded to ${weapon}.\n`
                      );
                    }
                  } else if (out.includes('acquired')) {
                    if (out.includes('armor')) {
                      const armor = out
                        .replace('acquired ', '')
                        .replace('(armor)', '')
                        .replaceAll('\n', '')
                        .trim();
                      console.log(armor, armor.length);
                      const armor_name = Object.values(armors).find(
                        (a) => a.name.toUpperCase() === armor.toUpperCase()
                      )?.name;
                      if (!armor_name) {
                        // prettier-ignore
                        throw new Error('Armor couldn\'t find');
                      }
                      user.armor = armor_name;
                      outcomesPrivate.push(
                        `You have acquired ${armor} (armor).\n`
                      );
                      outcomesFeed.push(
                        `${userMention(
                          user.discord_id
                        )} has acquired ${armor} (armor).\n`
                      );
                    } else if (out.includes('weapon')) {
                      const weapon = out
                        .replace('acquired ', '')
                        .replace('(weapon)', '')
                        .replaceAll('\n', '')
                        .trim();
                      const weapon_name = Object.values(weapons).find(
                        (a) => a.name.toUpperCase() === weapon.toUpperCase()
                      )?.name;
                      if (!weapon_name) {
                        // prettier-ignore
                        throw new Error('Weapon couldn\'t find');
                      }
                      user.weapon = weapon_name;
                      outcomesPrivate.push(
                        `You have acquired ${weapon} (weapon).\n`
                      );
                      outcomesFeed.push(
                        `${userMention(
                          user.discord_id
                        )} has acquired ${weapon} (weapon).\n`
                      );
                    }
                  }
                });
                if (channel) {
                  const feedWithoutOutcome = random.feed
                    .slice(0, random.feed.indexOf('Outcome:'))
                    .replaceAll('@xxx', userMention(user.discord_id));
                  await channel.send(
                    `${feedWithoutOutcome}\n${outcomesFeed.join('')}`
                  );
                }
                await i.update({
                  embeds: [
                    new EmbedBuilder().setDescription(
                      `${italic(random.scenario)}\n\n${
                        random.bits
                      }\n\n${outcomesPrivate.join('')}`
                    )
                  ],
                  ephemeral: true
                });
              } else {
                const isThereOtherPlayer = await Duel.findOne(
                  {
                    discord_id: { $ne: i.user.id }
                  },
                  { session }
                ).sort({ doc_created_at: 1 });
                if (
                  (random_number >= 45 && random_number <= 49) ||
                  !isThereOtherPlayer
                ) {
                  if (channel) {
                    const feedWithoutOutcome = random.feed.replaceAll(
                      '@xxx',
                      userMention(user.discord_id)
                    );
                    await channel.send(feedWithoutOutcome);
                    await Promise.all([
                      channel.send(feedWithoutOutcome),
                      i.update({
                        embeds: [
                          new EmbedBuilder().setDescription(
                            `${italic(random.scenario)}\n\n${random.bits}\n\n`
                          )
                        ],
                        ephemeral: true
                      })
                    ]);
                  } else {
                    await i.update({
                      embeds: [
                        new EmbedBuilder().setDescription(
                          `${italic(random.scenario)}\n\n${random.bits}\n\n`
                        )
                      ],
                      ephemeral: true
                    });
                  }
                } else if (random_number >= 50) {
                  console.log('Battle encounter');
                  await startDuel(session, user, i, embed, row, true);
                  if (channel) {
                    const feedWithoutOutcome = random.feed.replaceAll(
                      '@xxx',
                      userMention(user.discord_id)
                    );
                    await channel.send(feedWithoutOutcome);
                    await Promise.all([
                      channel.send(feedWithoutOutcome),
                      i.update({
                        embeds: [
                          new EmbedBuilder().setDescription(
                            `${italic(random.scenario)}\n\n`
                          )
                        ],
                        ephemeral: true
                      })
                    ]);
                  } else {
                    await i.update({
                      embeds: [
                        new EmbedBuilder().setDescription(
                          `${italic(random.scenario)}\n\n${random.bits}\n\n`
                        )
                      ],
                      ephemeral: true
                    });
                  }
                }
              }
              await user.save({ session });
            } else if (i.customId === 'shop') {
              try {
                await i.update({
                  embeds: [createShopEmbed(user)],
                  components: [extraRows.shop],
                  ephemeral: true
                });
              } catch (err) {
                console.error(err);
                await i.update({
                  content: 'There has been an error!',
                  embeds: [createShopEmbed(user)],
                  components: [row],
                  ephemeral: true
                });
              }
            } else if (i.customId === 'buy_potion') {
              if (user.gold < user.health_potion_cost) {
                await i.update({
                  embeds: [
                    createNotificationEmbed(
                      'Ooops!',
                      'You do not have enough credit to buy a repair kit!'
                    ),
                    createShopEmbed(user)
                  ],
                  components: [extraRows.shop],
                  ephemeral: true
                });
              } else {
                user.gold -= user.health_potion_cost;
                user.health_points = Math.min(user.health_points + 33, 100);
                user.health_potion_cost *= 2;
                await user.save({ session });
                await i.update({
                  embeds: [
                    createNotificationEmbed(
                      'Success!',
                      'You have bought and used a repair kit!'
                    ),
                    createShopEmbed(user)
                  ],
                  components: [extraRows.shop],
                  ephemeral: true
                });
              }
            } else if (i.customId === 'buying') {
              createExtraRows(extraRows, 'buying');
              await i.update({
                embeds: [createShopEmbed(user)],
                components: [extraRows.buying],
                ephemeral: true
              });
            } else if (i.customId === 'buy_weapon') {
              if (user.weapon) {
                await i.update({
                  embeds: [
                    createNotificationEmbed(
                      'Ooops!',
                      'You already have a weapon. Sell it first to buy another one!'
                    ),
                    createShopEmbed(user)
                  ],
                  components: [extraRows.shop],
                  ephemeral: true
                });
              } else {
                createExtraRows(extraRows, 'buy_weapon');
                await i.update({
                  embeds: [createShopEmbed(user)],
                  components: [extraRows.buy_weapon],
                  ephemeral: true
                });
              }
            } else if (i.customId === 'sell_weapon') {
              if (!user.weapon) {
                await i.update({
                  embeds: [
                    createNotificationEmbed(
                      'Ooops!',
                      'You do not have a weapon to sell!'
                    ),
                    createShopEmbed(user)
                  ],
                  components: [extraRows.shop],
                  ephemeral: true
                });
                return;
              }
              const weapon = Object.values(weapons).find(
                (w) => w.name === user.weapon
              );
              user.gold += Math.floor(weapon.cost / 2);
              user.weapon = null;
              user.attack_power -= weapon.attack_power;
              await user.save({ session });
              await i.update({
                embeds: [
                  createNotificationEmbed(
                    'Success!',
                    'You have sold your weapon for half of its price!'
                  ),
                  createShopEmbed(user)
                ],
                components: [extraRows.shop],
                ephemeral: true
              });
            } else if (i.customId === 'buy_armor') {
              if (user.armor) {
                await i.update({
                  embeds: [
                    createNotificationEmbed(
                      'Ooops!',
                      'You already have an armor. Sell it first to buy another one!'
                    ),
                    createShopEmbed(user)
                  ],
                  components: [extraRows.shop],
                  ephemeral: true
                });
              } else {
                createExtraRows(extraRows, 'buy_armor');
                await i.update({
                  embeds: [createShopEmbed(user)],
                  components: [extraRows.buy_armor],
                  ephemeral: true
                });
              }
            } else if (i.customId === 'sell_armor') {
              if (!user.armor) {
                await i.update({
                  embeds: [
                    createNotificationEmbed(
                      'Ooops!',
                      'You do not have an armor to sell!'
                    ),
                    createShopEmbed(user)
                  ],
                  components: [extraRows.shop],
                  ephemeral: true
                });
                return;
              }
              const armor = Object.values(armors).find(
                (a) => a.name === user.armor
              );
              user.gold += Math.floor(armor.cost / 2);
              user.armor = null;
              await user.save({ session });
              await i.update({
                embeds: [
                  createNotificationEmbed(
                    'Success!',
                    'You have sold your armor for half of its price!'
                  ),
                  createShopEmbed(user)
                ],
                components: [extraRows.shop],
                ephemeral: true
              });
            }
          });
        } catch (error) {
          // await session.abortTransaction();
          console.error('Transaction aborted:', error);
        } finally {
          await session.endSession();
        }
      });
    } catch (err) {
      console.error(err);
    }
  }
};
