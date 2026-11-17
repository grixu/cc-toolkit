import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AppPopover from './AppPopover.vue';

describe('AppPopover', () => {
  it('keeps a click-triggered popover open after the pointer leaves', async () => {
    const wrapper = mount(AppPopover, { props: { trigger: 'click' }, slots: { trigger: 'Open', default: 'Menu' } });

    await wrapper.find('span').trigger('click');
    await wrapper.trigger('mouseleave');

    expect(wrapper.find('.popover__panel').exists()).toBe(true);
  });
});
