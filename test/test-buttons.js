import '../../polymer/polymer.js';
import { Polymer } from '../../polymer/lib/legacy/polymer-fn.js';
Polymer({
  _template: `
    <style>
      :host {
        display: block;
        border: 1px solid black;
        padding: 10px;
      }
    </style>

    <button id="button0">button0</button>
    <button id="button1">button1</button>
    <slot></slot>
    <button id="button2">button2</button>
`,

  is: 'test-buttons'
});
