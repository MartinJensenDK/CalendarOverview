import { store } from './store.js';
import { t } from './i18n.js';
import { loadMe, loadOverview, closeModal, openModal } from './actions.js';
import Icon from './components/Icon.js';
import Modal from './components/Modal.js';
import UserPicker from './components/UserPicker.js';
import TopBar from './components/TopBar.js';
import SideMenu from './components/SideMenu.js';
import OverviewGrid from './components/OverviewGrid.js';
import GroupModal from './components/GroupModal.js';
import ColorRulesModal from './components/ColorRulesModal.js';
import SettingsModal from './components/SettingsModal.js';
import HeatmapModal from './components/HeatmapModal.js';
import VacationModal from './components/VacationModal.js';
import PersonLookupModal from './components/PersonLookupModal.js';
import ConfirmDialog from './components/ConfirmDialog.js';
import Toasts from './components/Toasts.js';
import Tooltip from './components/Tooltip.js';

const { createApp, onMounted } = Vue;

const App = {
  components: { TopBar, SideMenu, OverviewGrid, GroupModal, ColorRulesModal, SettingsModal, HeatmapModal, VacationModal, PersonLookupModal, ConfirmDialog, Toasts, Tooltip },
  setup() {
    onMounted(async () => {
      try {
        await loadMe();
        await loadOverview();
      } catch (e) {
        store.error = e.message || t('Something went wrong');
      }
      // Start typing anywhere to look up a person.
      document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1 || !/[a-zA-ZæøåÆØÅ]/.test(e.key)) return;
        const el = document.activeElement;
        if (el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable)) return;
        if (store.modal || store.confirm || !store.ready) return;
        e.preventDefault();
        openModal('lookup', { initial: e.key });
      });
    });
    return { store, closeModal, t };
  },
  template: `
    <div class="app">
      <top-bar></top-bar>
      <div class="app-body" :class="{ 'menu-collapsed': store.prefs.menu_collapsed }">
        <side-menu></side-menu>
        <overview-grid></overview-grid>
      </div>
      <group-modal v-if="store.modal && store.modal.name === 'group'" v-bind="store.modal.props"></group-modal>
      <color-rules-modal v-if="store.modal && store.modal.name === 'rules'"></color-rules-modal>
      <settings-modal v-if="store.modal && store.modal.name === 'settings'"></settings-modal>
      <heatmap-modal v-if="store.modal && store.modal.name === 'heatmap'" v-bind="store.modal.props"></heatmap-modal>
      <vacation-modal v-if="store.modal && store.modal.name === 'vacation'"></vacation-modal>
      <person-lookup-modal v-if="store.modal && store.modal.name === 'lookup'" v-bind="store.modal.props"></person-lookup-modal>
      <confirm-dialog></confirm-dialog>
      <toasts></toasts>
      <tooltip></tooltip>
    </div>`,
};

const app = createApp(App);
app.component('icon', Icon);
app.component('modal', Modal);
app.component('user-picker', UserPicker);
app.config.errorHandler = (err) => { console.error(err); };
app.mount('#app');
