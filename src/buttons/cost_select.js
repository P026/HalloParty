import UserManager from '../managers/user_manager';

export const cost_select = {
  /** @param { import('discord.js').ButtonInteraction } interaction */
  handle: async function (interaction, params) {
    const userManager = new UserManager(
      interaction.client,
      interaction.user.id
    );
    await userManager.changeCostume(params.id);
    await interaction.showModal({
      title: 'Choose costume',
      custom_id: 'choose_cost',
      components: [
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: 'clone_name',
              style: 1,
              label: 'Insert an alias for your anonymous self',
            },
          ],
        },
      ],
    });
  },
};
