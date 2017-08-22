import '../polymer/polymer.js';
import { IronFitBehavior } from '../iron-fit-behavior/iron-fit-behavior.js';
import { IronResizableBehavior } from '../iron-resizable-behavior/iron-resizable-behavior.js';
import { IronOverlayManager } from './iron-overlay-manager.js';
import { IronFocusablesHelper } from './iron-focusables-helper.js';
import { dom } from '../polymer/lib/legacy/polymer.dom.js';

export const IronOverlayBehaviorImpl = {

  properties: {

    /**
     * True if the overlay is currently displayed.
     */
    opened: {
      observer: '_openedChanged',
      type: Boolean,
      value: false,
      notify: true
    },

    /**
     * True if the overlay was canceled when it was last closed.
     */
    canceled: {
      observer: '_canceledChanged',
      readOnly: true,
      type: Boolean,
      value: false
    },

    /**
     * Set to true to display a backdrop behind the overlay. It traps the focus
     * within the light DOM of the overlay.
     */
    withBackdrop: {
      observer: '_withBackdropChanged',
      type: Boolean
    },

    /**
     * Set to true to disable auto-focusing the overlay or child nodes with
     * the `autofocus` attribute` when the overlay is opened.
     */
    noAutoFocus: {
      type: Boolean,
      value: false
    },

    /**
     * Set to true to disable canceling the overlay with the ESC key.
     */
    noCancelOnEscKey: {
      type: Boolean,
      value: false
    },

    /**
     * Set to true to disable canceling the overlay by clicking outside it.
     */
    noCancelOnOutsideClick: {
      type: Boolean,
      value: false
    },

    /**
     * Contains the reason(s) this overlay was last closed (see `iron-overlay-closed`).
     * `IronOverlayBehavior` provides the `canceled` reason; implementers of the
     * behavior can provide other reasons in addition to `canceled`.
     */
    closingReason: {
      // was a getter before, but needs to be a property so other
      // behaviors can override this.
      type: Object
    },

    /**
     * Set to true to enable restoring of focus when overlay is closed.
     */
    restoreFocusOnClose: {
      type: Boolean,
      value: false
    },

    /**
     * Set to true to keep overlay always on top.
     */
    alwaysOnTop: {
      type: Boolean
    },

    /**
     * Shortcut to access to the overlay manager.
     * @private
     * @type {Polymer.IronOverlayManagerClass}
     */
    _manager: {
      type: Object,
      value: IronOverlayManager
    },

    /**
     * The node being focused.
     * @type {?Node}
     */
    _focusedChild: {
      type: Object
    }

  },

  listeners: {
    'iron-resize': '_onIronResize'
  },

  /**
   * The backdrop element.
   * @type {Element}
   */
  get backdropElement() {
    return this._manager.backdropElement;
  },

  /**
   * Returns the node to give focus to.
   * @type {Node}
   */
  get _focusNode() {
    return this._focusedChild || dom(this).querySelector('[autofocus]') || this;
  },

  /**
   * Array of nodes that can receive focus (overlay included), ordered by `tabindex`.
   * This is used to retrieve which is the first and last focusable nodes in order
   * to wrap the focus for overlays `with-backdrop`.
   *
   * If you know what is your content (specifically the first and last focusable children),
   * you can override this method to return only `[firstFocusable, lastFocusable];`
   * @type {Array<Node>}
   * @protected
   */
  get _focusableNodes() {
    return IronFocusablesHelper.getTabbableNodes(this);
  },

  ready: function() {
    // Used to skip calls to notifyResize and refit while the overlay is animating.
    this.__isAnimating = false;
    // with-backdrop needs tabindex to be set in order to trap the focus.
    // If it is not set, IronOverlayBehavior will set it, and remove it if with-backdrop = false.
    this.__shouldRemoveTabIndex = false;
    // Used for wrapping the focus on TAB / Shift+TAB.
    this.__firstFocusableNode = this.__lastFocusableNode = null;
    // Used by __onNextAnimationFrame to cancel any previous callback.
    this.__raf = null;
    // Focused node before overlay gets opened. Can be restored on close.
    this.__restoreFocusNode = null;
    this._ensureSetup();
  },

  attached: function() {
    // Call _openedChanged here so that position can be computed correctly.
    if (this.opened) {
      this._openedChanged(this.opened);
    }
    this._observer = dom(this).observeNodes(this._onNodesChange);
  },

  detached: function() {
    dom(this).unobserveNodes(this._observer);
    this._observer = null;
    if (this.__raf) {
      window.cancelAnimationFrame(this.__raf);
      this.__raf = null;
    }
    this._manager.removeOverlay(this);
  },

  /**
   * Toggle the opened state of the overlay.
   */
  toggle: function() {
    this._setCanceled(false);
    this.opened = !this.opened;
  },

  /**
   * Open the overlay.
   */
  open: function() {
    this._setCanceled(false);
    this.opened = true;
  },

  /**
   * Close the overlay.
   */
  close: function() {
    this._setCanceled(false);
    this.opened = false;
  },

  /**
   * Cancels the overlay.
   * @param {Event=} event The original event
   */
  cancel: function(event) {
    var cancelEvent = this.fire('iron-overlay-canceled', event, {cancelable: true});
    if (cancelEvent.defaultPrevented) {
      return;
    }

    this._setCanceled(true);
    this.opened = false;
  },

  /**
   * Invalidates the cached tabbable nodes. To be called when any of the focusable
   * content changes (e.g. a button is disabled).
   */
  invalidateTabbables: function() {
    this.__firstFocusableNode = this.__lastFocusableNode = null;
  },

  _ensureSetup: function() {
    if (this._overlaySetup) {
      return;
    }
    this._overlaySetup = true;
    this.style.outline = 'none';
    this.style.display = 'none';
  },

  /**
   * Called when `opened` changes.
   * @param {boolean=} opened
   * @protected
   */
  _openedChanged: function(opened) {
    if (opened) {
      this.removeAttribute('aria-hidden');
    } else {
      this.setAttribute('aria-hidden', 'true');
    }

    // Defer any animation-related code on attached
    // (_openedChanged gets called again on attached).
    if (!this.isAttached) {
      return;
    }

    this.__isAnimating = true;

    // Use requestAnimationFrame for non-blocking rendering.
    this.__onNextAnimationFrame(this.__openedChanged);
  },

  _canceledChanged: function() {
    this.closingReason = this.closingReason || {};
    this.closingReason.canceled = this.canceled;
  },

  _withBackdropChanged: function() {
    // If tabindex is already set, no need to override it.
    if (this.withBackdrop && !this.hasAttribute('tabindex')) {
      this.setAttribute('tabindex', '-1');
      this.__shouldRemoveTabIndex = true;
    } else if (this.__shouldRemoveTabIndex) {
      this.removeAttribute('tabindex');
      this.__shouldRemoveTabIndex = false;
    }
    if (this.opened && this.isAttached) {
      this._manager.trackBackdrop();
    }
  },

  /**
   * tasks which must occur before opening; e.g. making the element visible.
   * @protected
   */
  _prepareRenderOpened: function() {
    // Store focused node.
    this.__restoreFocusNode = this._manager.deepActiveElement;

    // Needed to calculate the size of the overlay so that transitions on its size
    // will have the correct starting points.
    this._preparePositioning();
    this.refit();
    this._finishPositioning();

    // Safari will apply the focus to the autofocus element when displayed
    // for the first time, so we make sure to return the focus where it was.
    if (this.noAutoFocus && document.activeElement === this._focusNode) {
      this._focusNode.blur();
      this.__restoreFocusNode.focus();
    }
  },

  /**
   * Tasks which cause the overlay to actually open; typically play an animation.
   * @protected
   */
  _renderOpened: function() {
    this._finishRenderOpened();
  },

  /**
   * Tasks which cause the overlay to actually close; typically play an animation.
   * @protected
   */
  _renderClosed: function() {
    this._finishRenderClosed();
  },

  /**
   * Tasks to be performed at the end of open action. Will fire `iron-overlay-opened`.
   * @protected
   */
  _finishRenderOpened: function() {
    this.notifyResize();
    this.__isAnimating = false;

    this.fire('iron-overlay-opened');
  },

  /**
   * Tasks to be performed at the end of close action. Will fire `iron-overlay-closed`.
   * @protected
   */
  _finishRenderClosed: function() {
    // Hide the overlay.
    this.style.display = 'none';
    // Reset z-index only at the end of the animation.
    this.style.zIndex = '';
    this.notifyResize();
    this.__isAnimating = false;
    this.fire('iron-overlay-closed', this.closingReason);
  },

  _preparePositioning: function() {
    this.style.transition = this.style.webkitTransition = 'none';
    this.style.transform = this.style.webkitTransform = 'none';
    this.style.display = '';
  },

  _finishPositioning: function() {
    // First, make it invisible & reactivate animations.
    this.style.display = 'none';
    // Force reflow before re-enabling animations so that they don't start.
    // Set scrollTop to itself so that Closure Compiler doesn't remove this.
    this.scrollTop = this.scrollTop;
    this.style.transition = this.style.webkitTransition = '';
    this.style.transform = this.style.webkitTransform = '';
    // Now that animations are enabled, make it visible again
    this.style.display = '';
    // Force reflow, so that following animations are properly started.
    // Set scrollTop to itself so that Closure Compiler doesn't remove this.
    this.scrollTop = this.scrollTop;
  },

  /**
   * Applies focus according to the opened state.
   * @protected
   */
  _applyFocus: function() {
    if (this.opened) {
      if (!this.noAutoFocus) {
        this._focusNode.focus();
      }
    }
    else {
      this._focusNode.blur();
      this._focusedChild = null;
      // Restore focus.
      if (this.restoreFocusOnClose && this.__restoreFocusNode) {
        this.__restoreFocusNode.focus();
      }
      this.__restoreFocusNode = null;
      // If many overlays get closed at the same time, one of them would still
      // be the currentOverlay even if already closed, and would call _applyFocus
      // infinitely, so we check for this not to be the current overlay.
      var currentOverlay = this._manager.currentOverlay();
      if (currentOverlay && this !== currentOverlay) {
        currentOverlay._applyFocus();
      }
    }
  },

  /**
   * Cancels (closes) the overlay. Call when click happens outside the overlay.
   * @param {!Event} event
   * @protected
   */
  _onCaptureClick: function(event) {
    if (!this.noCancelOnOutsideClick) {
      this.cancel(event);
    }
  },

  /**
   * Keeps track of the focused child. If withBackdrop, traps focus within overlay.
   * @param {!Event} event
   * @protected
   */
  _onCaptureFocus: function (event) {
    if (!this.withBackdrop) {
      return;
    }
    var path = dom(event).path;
    if (path.indexOf(this) === -1) {
      event.stopPropagation();
      this._applyFocus();
    } else {
      this._focusedChild = path[0];
    }
  },

  /**
   * Handles the ESC key event and cancels (closes) the overlay.
   * @param {!Event} event
   * @protected
   */
  _onCaptureEsc: function(event) {
    if (!this.noCancelOnEscKey) {
      this.cancel(event);
    }
  },

  /**
   * Handles TAB key events to track focus changes.
   * Will wrap focus for overlays withBackdrop.
   * @param {!Event} event
   * @protected
   */
  _onCaptureTab: function(event) {
    if (!this.withBackdrop) {
      return;
    }
    this.__ensureFirstLastFocusables();
    // TAB wraps from last to first focusable.
    // Shift + TAB wraps from first to last focusable.
    var shift = event.shiftKey;
    var nodeToCheck = shift ? this.__firstFocusableNode : this.__lastFocusableNode;
    var nodeToSet = shift ? this.__lastFocusableNode : this.__firstFocusableNode;
    var shouldWrap = false;
    if (nodeToCheck === nodeToSet) {
      // If nodeToCheck is the same as nodeToSet, it means we have an overlay
      // with 0 or 1 focusables; in either case we still need to trap the
      // focus within the overlay.
      shouldWrap = true;
    } else {
      // In dom=shadow, the manager will receive focus changes on the main
      // root but not the ones within other shadow roots, so we can't rely on
      // _focusedChild, but we should check the deepest active element.
      var focusedNode = this._manager.deepActiveElement;
      // If the active element is not the nodeToCheck but the overlay itself,
      // it means the focus is about to go outside the overlay, hence we
      // should prevent that (e.g. user opens the overlay and hit Shift+TAB).
      shouldWrap = (focusedNode === nodeToCheck || focusedNode === this);
    }

    if (shouldWrap) {
      // When the overlay contains the last focusable element of the document
      // and it's already focused, pressing TAB would move the focus outside
      // the document (e.g. to the browser search bar). Similarly, when the
      // overlay contains the first focusable element of the document and it's
      // already focused, pressing Shift+TAB would move the focus outside the
      // document (e.g. to the browser search bar).
      // In both cases, we would not receive a focus event, but only a blur.
      // In order to achieve focus wrapping, we prevent this TAB event and
      // force the focus. This will also prevent the focus to temporarily move
      // outside the overlay, which might cause scrolling.
      event.preventDefault();
      this._focusedChild = nodeToSet;
      this._applyFocus();
    }
  },

  /**
   * Refits if the overlay is opened and not animating.
   * @protected
   */
  _onIronResize: function() {
    if (this.opened && !this.__isAnimating) {
      this.__onNextAnimationFrame(this.refit);
    }
  },

  /**
   * Will call notifyResize if overlay is opened.
   * Can be overridden in order to avoid multiple observers on the same node.
   * @protected
   */
  _onNodesChange: function() {
    if (this.opened && !this.__isAnimating) {
      // It might have added focusable nodes, so invalidate cached values.
      this.invalidateTabbables();
      this.notifyResize();
    }
  },

  /**
   * Will set first and last focusable nodes if any of them is not set.
   * @private
   */
  __ensureFirstLastFocusables: function() {
    if (!this.__firstFocusableNode || !this.__lastFocusableNode) {
      var focusableNodes = this._focusableNodes;
      this.__firstFocusableNode = focusableNodes[0];
      this.__lastFocusableNode = focusableNodes[focusableNodes.length - 1];
    }
  },

  /**
   * Tasks executed when opened changes: prepare for the opening, move the
   * focus, update the manager, render opened/closed.
   * @private
   */
  __openedChanged: function() {
    if (this.opened) {
      // Make overlay visible, then add it to the manager.
      this._prepareRenderOpened();
      this._manager.addOverlay(this);
      // Move the focus to the child node with [autofocus].
      this._applyFocus();

      this._renderOpened();
    } else {
      // Remove overlay, then restore the focus before actually closing.
      this._manager.removeOverlay(this);
      this._applyFocus();

      this._renderClosed();
    }
  },

  /**
   * Executes a callback on the next animation frame, overriding any previous
   * callback awaiting for the next animation frame. e.g.
   * `__onNextAnimationFrame(callback1) && __onNextAnimationFrame(callback2)`;
   * `callback1` will never be invoked.
   * @param {!Function} callback Its `this` parameter is the overlay itself.
   * @private
   */
  __onNextAnimationFrame: function(callback) {
    if (this.__raf) {
      window.cancelAnimationFrame(this.__raf);
    }
    var self = this;
    this.__raf = window.requestAnimationFrame(function nextAnimationFrame() {
      self.__raf = null;
      callback.call(self);
    });
  }

};

export const IronOverlayBehavior = [IronFitBehavior, IronResizableBehavior, IronOverlayBehaviorImpl];
