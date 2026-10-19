import DefaultTheme from 'vitepress/theme';
import {h} from 'vue';
import './custom.css';

export default {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      'layout-bottom': () =>
        h('div', {class: 'made-by'}, [
          h('span', 'Developed by '),
          h(
            'a',
            {href: 'https://lupiq.com', target: '_blank', rel: 'noopener'},
            [
              h('img', {
                class: 'only-light',
                src: '/lupiq_logo_colored.svg',
                alt: 'lupiq',
              }),
              h('img', {
                class: 'only-dark',
                src: '/lupiq_logo_white.svg',
                alt: 'lupiq',
              }),
            ],
          ),
        ]),
    }),
};
