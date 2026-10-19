import { globalStyle } from '@vanilla-extract/css';
import { PageHeader, PageNavHeader } from '../../../components/page/style.css';
const app = 'html[data-app-text-size]';
for (const header of [PageHeader({}).split(' ')[0], PageNavHeader({}).split(' ')[0]]) {
  globalStyle(`${app} .${header}`, { height: 'auto', minHeight: 56, flexWrap: 'wrap', gap: 6 });
  globalStyle(`${app} .${header} > *`, { minWidth: 0, maxWidth: '100%', flexWrap: 'wrap' });
}
