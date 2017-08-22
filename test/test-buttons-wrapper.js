import '../../polymer/polymer.js';
import './test-buttons.js';
import { Polymer } from '../../polymer/lib/legacy/polymer-fn.js';
Polymer({
  _template: `
    <style>
      :host {
        display: block;
        border: 1px solid gray;
        padding: 10px;
      }
    </style>

    <select id="select">
      <option>1</option>
    </select>
    <test-buttons id="wrapped">
      <slot></slot>
    </test-buttons>
    <div tabindex="0" id="focusableDiv">Focusable div</div>
`,

  is: 'test-buttons-wrapper'
});
