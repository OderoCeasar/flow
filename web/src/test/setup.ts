import '@testing-library/jest-dom/vitest';
import '../i18n';
import i18n from '../i18n';

void i18n.changeLanguage('en');

// jsdom lacks <dialog> methods.
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
  this.open = true;
};
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
  this.open = false;
};
