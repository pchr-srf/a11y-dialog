import focusableSelectors from 'focusable-selectors'

var TAB_KEY = 'Tab'
var ESCAPE_KEY = 'Escape'

/**
 * Constructor to instantiate a dialog
 *
 * @class
 * @constructor
 * @param {Element} element
 */
function A11yDialog(element) {
  // Prebind the functions that will be bound in `addEventListener` and
  // `removeEventListener` to avoid losing references
  this._show = this.show.bind(this)
  this._hide = this.hide.bind(this)
  this._maintainFocus = this._maintainFocus.bind(this)
  this._bindKeypress = this._bindKeypress.bind(this)

  this.$el = element
  this.shown = false
  this._id = this.$el.getAttribute('data-a11y-dialog') || this.$el.id
  this._previouslyFocused = null
  this._listeners = {}

  // Initialise everything needed for the dialog to work properly
  this.$el.setAttribute('aria-hidden', true)
  this.$el.setAttribute('aria-modal', true)
  this.$el.setAttribute('tabindex', -1)

  if (!this.$el.hasAttribute('role')) {
    this.$el.setAttribute('role', 'dialog')
  }

  // Keep a collection of dialog openers, each of which will be bound a click
  // event listener to open the dialog
  this._openers = $$('[data-a11y-dialog-show="' + this._id + '"]')
  this._openers.forEach(
    function (opener) {
      opener.addEventListener('click', this._show)
    }.bind(this)
  )

  // Keep a collection of dialog closers, each of which will be bound a click
  // event listener to close the dialog
  this._closers = $$('[data-a11y-dialog-hide]', this.$el).concat(
    $$('[data-a11y-dialog-hide="' + this._id + '"]')
  )
  this._closers.forEach(
    function (closer) {
      closer.addEventListener('click', this._hide)
    }.bind(this)
  )

  // Execute all callbacks registered for the `create` event
  this._fire('create')
}

/**
 * Show the dialog element, trap the current focus within it, listen for some
 * specific key presses and fire all registered callbacks for `show` event
 *
 * @param {CustomEvent} event - An optional `CustomEvent`, passed to `show`
 *                              event listeners
 * @return {A11yDialog}
 */
A11yDialog.prototype.show = function (event) {
  // If the dialog is already open, abort
  if (this.shown) {
    return this
  }

  // Keep a reference to the currently focused element to be able to restore
  // it later
  this._previouslyFocused = document.activeElement
  this.$el.removeAttribute('aria-hidden')
  this.shown = true

  // Set the focus to the dialog element
  moveFocusToDialog(this.$el)

  // Bind a focus event listener to the body element to make sure the focus
  // stays trapped inside the dialog while open, and start listening for some
  // specific key presses (TAB and ESC)
  document.body.addEventListener('focus', this._maintainFocus, true)
  document.addEventListener('keydown', this._bindKeypress)

  // Execute all callbacks registered for the `show` event
  this._fire('show', event)

  return this
}

/**
 * Hide the dialog element, restore the focus to the previously active element,
 * stop listening for some specific key presses and fire all registered
 * callbacks for `hide` event
 *
 * @param {CustomEvent} event - An optional `CustomEvent`, passed to `hide`
 *                              event listeners
 * @return {A11yDialog}
 */
A11yDialog.prototype.hide = function (event) {
  // If the dialog is already closed, abort
  if (!this.shown) {
    return this
  }

  this.shown = false
  this.$el.setAttribute('aria-hidden', 'true')

  // If there was a focused element before the dialog was opened (and it has a
  // `focus` method), restore the focus back to it
  // See: https://github.com/KittyGiraudel/a11y-dialog/issues/108
  if (this._previouslyFocused && this._previouslyFocused.focus) {
    this._previouslyFocused.focus()
  }

  // Remove the focus event listener to the body element and stop listening
  // for specific key presses
  document.body.removeEventListener('focus', this._maintainFocus, true)
  document.removeEventListener('keydown', this._bindKeypress)

  // Execute all callbacks registered for the `hide` event
  this._fire('hide', event)

  return this
}

/**
 * Destroy the current instance (after making sure the dialog has been hidden)
 * and remove all associated listeners from dialog openers and closers
 *
 * @return {A11yDialog}
 */
A11yDialog.prototype.destroy = function () {
  // Hide the dialog to avoid destroying an open instance
  this.hide()

  // Remove the click event listener from all dialog openers
  this._openers.forEach(
    function (opener) {
      opener.removeEventListener('click', this._show)
    }.bind(this)
  )

  // Remove the click event listener from all dialog closers
  this._closers.forEach(
    function (closer) {
      closer.removeEventListener('click', this._hide)
    }.bind(this)
  )

  // Execute all callbacks registered for the `destroy` event
  this._fire('destroy')

  // Empty the listeners map
  this._listeners = {}

  return this
}

/**
 * Register a new callback for the given event type
 *
 * @param {string} type
 * @param {Function} handler
 * @return {A11yDialog}
 */
A11yDialog.prototype.on = function (type, handler) {
  if (typeof this._listeners[type] === 'undefined') {
    this._listeners[type] = []
  }

  this._listeners[type].push(handler)

  return this
}

/**
 * Unregister an existing callback for the given event type
 *
 * @param {string} type
 * @param {Function} handler
 * @return {A11yDialog}
 */
A11yDialog.prototype.off = function (type, handler) {
  var index = (this._listeners[type] || []).indexOf(handler)

  if (index > -1) {
    this._listeners[type].splice(index, 1)
  }

  return this
}

/**
 * Iterate over all registered handlers for given type and call them all with
 * the dialog element as first argument, event as second argument (if any). Also
 * dispatch a custom event on the DOM element itself to make it possible to
 * react to the lifecycle of auto-instantiated dialogs
 *
 * @access private
 * @param {string} type
 * @param {CustomEvent} event
 */
A11yDialog.prototype._fire = function (type, event) {
  var listeners = this._listeners[type] || []
  var domEvent = new CustomEvent(type, { detail: event })

  this.$el.dispatchEvent(domEvent)

  listeners.forEach(
    function (listener) {
      listener(this.$el, event)
    }.bind(this)
  )
}

/**
 * Private event handler used when listening to some specific key presses
 * (namely ESC and TAB)
 *
 * @access private
 * @param {Event} event
 */
A11yDialog.prototype._bindKeypress = function (event) {
  // This is an escape hatch in case there are nested dialogs, so the keypresses
  // are only reacted to for the most recent one
  if (!this.$el.contains(document.activeElement)) return

  // If the dialog is shown and the ESC key is pressed, prevent any further
  // effects from the ESC key and hide the dialog, unless its role is
  // `alertdialog`, which should be modal
  if (
    this.shown &&
    event.key === ESCAPE_KEY &&
    this.$el.getAttribute('role') !== 'alertdialog'
  ) {
    event.preventDefault()
    this.hide(event)
  }

  // If the dialog is shown and the TAB key is pressed, make sure the focus
  // stays trapped within the dialog element
  if (this.shown && event.key === TAB_KEY) {
    trapTabKey(this.$el, event)
  }
}

/**
 * Private event handler used when making sure the focus stays within the
 * currently open dialog
 *
 * @access private
 * @param {Event} event
 */
A11yDialog.prototype._maintainFocus = function (event) {
  // If the dialog is shown and the focus is not within a dialog element (either
  // this one or another one in case of nested dialogs) or within an element
  // with the `data-a11y-dialog-focus-trap-ignore` attribute, move it back to
  // the dialog container.
  // See: https://github.com/KittyGiraudel/a11y-dialog/issues/177
  if (
    this.shown &&
    !event.target.closest('[aria-modal="true"]') &&
    !event.target.closest('[data-a11y-dialog-ignore-focus-trap]')
  ) {
    moveFocusToDialog(this.$el)
  }
}

/**
 * Query the DOM for nodes matching the given selector, scoped to context (or
 * the whole document)
 *
 * @param {String} selector
 * @param {Element} [context = document]
 * @return {Array<Element>}
 */
function $$(selector, context = document) {
  return Array.prototype.slice.call(context.querySelectorAll(selector))
}

/**
 * Set the focus to the first element with `autofocus` with the element or the
 * element itself
 *
 * @param {Element} node
 */
function moveFocusToDialog(node) {
  var focused = node.querySelector('[autofocus]') || node

  focused.focus()
}

/**
 * Get the focusable children of the given element
 *
 * @param {Element} node
 * @return {Array<Element>}
 */
function getFocusableChildren(node) {
  return $$(focusableSelectors.join(','), node).filter(function (child) {
    return !!(
      child.offsetWidth ||
      child.offsetHeight ||
      child.getClientRects().length
    )
  })
}

/**
 * Trap the focus inside the given element
 *
 * @param {Element} node
 * @param {Event} event
 */
function trapTabKey(node, event) {
  var focusableChildren = getFocusableChildren(node)
  var focusedItemIndex = focusableChildren.indexOf(document.activeElement)

  // If the SHIFT key is pressed while tabbing (moving backwards) and the
  // currently focused item is the first one, move the focus to the last
  // focusable item from the dialog element
  if (event.shiftKey && focusedItemIndex === 0) {
    focusableChildren[focusableChildren.length - 1].focus()
    event.preventDefault()
    // If the SHIFT key is not pressed (moving forwards) and the currently
    // focused item is the last one, move the focus to the first focusable item
    // from the dialog element
  } else if (
    !event.shiftKey &&
    focusedItemIndex === focusableChildren.length - 1
  ) {
    focusableChildren[0].focus()
    event.preventDefault()
  }
}

function instantiateDialogs() {
  $$('[data-a11y-dialog]').forEach(function (node) {
    new A11yDialog(node)
  })
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', instantiateDialogs)
  } else {
    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(instantiateDialogs)
    } else {
      window.setTimeout(instantiateDialogs, 16)
    }
  }
}

export default A11yDialog