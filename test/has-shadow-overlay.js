/**
@license
Copyright (c) 2019 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at
http://polymer.github.io/LICENSE.txt The complete set of authors may be found at
http://polymer.github.io/AUTHORS.txt The complete set of contributors may be
found at http://polymer.github.io/CONTRIBUTORS.txt Code distributed by Google as
part of the polymer project is also subject to an additional IP rights grant
found at http://polymer.github.io/PATENTS.txt
*/
import '@polymer/polymer/polymer-legacy.js';

import {Polymer} from '@polymer/polymer/lib/legacy/polymer-fn.js';
import {dom} from '@polymer/polymer/lib/legacy/polymer.dom.js';
import {html} from '@polymer/polymer/lib/utils/html-tag.js';

import {IronOverlayBehavior} from '../iron-overlay-behavior.js';

const trivialOverlayLocalName =
    `trivial-overlay-${Math.random().toString(32).substring(2)}`;

Polymer({
  _template: html`
    <style>
      :host {
        background: white;
        color: black;
        border: 1px solid black;
      }
    </style>

    <slot></slot>
  `,

  is: trivialOverlayLocalName,
  behaviors: [IronOverlayBehavior],
});

Polymer({
  _template: html``,

  is: 'has-shadow-overlay',

  attached() {
    // Set up the shadow root:
    // ```html
    // <trivialOverlayLocalName>
    //   <slot></slot>
    // </trivialOverlayLocalName>
    // ```
    this.overlay = document.createElement(trivialOverlayLocalName);
    dom(this.overlay).appendChild(document.createElement('slot'));
    dom(this.root).appendChild(this.overlay);
  },
});
