import {Inject, Injectable, OpaqueToken} from 'angular2/src/core/di';
import {AnimationBuilder} from 'angular2/src/animate/animation_builder';
import {
  isPresent,
  isBlank,
  RegExpWrapper,
  CONST_EXPR,
  stringify
} from 'angular2/src/core/facade/lang';
import {BaseException, WrappedException} from 'angular2/src/core/facade/exceptions';

import {DOM} from 'angular2/src/core/dom/dom_adapter';

import {EventManager} from './events/event_manager';

import {DomSharedStylesHost} from './view/shared_styles_host';
import {WtfScopeFn, wtfLeave, wtfCreateScope} from '../../profile/profile';

import {
  Renderer,
  RenderProtoViewRef,
  RenderViewRef,
  RenderElementRef,
  RenderFragmentRef,
  RenderViewWithFragments,
  RenderTemplateCmd,
  RenderEventDispatcher
} from '../api';

import {DOCUMENT} from './dom_tokens';
import {createRenderView, NodeFactory} from '../view_factory';
import {DefaultRenderView, DefaultRenderFragmentRef, DefaultProtoViewRef} from '../view';
import {camelCaseToDashCase} from './util';

@Injectable()
export class DomRenderer implements Renderer, NodeFactory<Node> {
  private _componentCmds: Map<number, RenderTemplateCmd[]> = new Map();
  private _document;

  /**
   * @private
   */
  constructor(private _eventManager: EventManager,
              private _domSharedStylesHost: DomSharedStylesHost, private _animate: AnimationBuilder,
              @Inject(DOCUMENT) document) {
    this._document = document;
  }

  registerComponentTemplate(templateId: number, commands: RenderTemplateCmd[], styles: string[]) {
    this._componentCmds.set(templateId, commands);
    this._domSharedStylesHost.addStyles(styles);
  }

  resolveComponentTemplate(templateId: number): RenderTemplateCmd[] {
    return this._componentCmds.get(templateId);
  }

  createProtoView(cmds: RenderTemplateCmd[]): RenderProtoViewRef {
    return new DefaultProtoViewRef(cmds);
  }

  _createRootHostViewScope: WtfScopeFn = wtfCreateScope('DomRenderer#createRootHostView()');
  createRootHostView(hostProtoViewRef: RenderProtoViewRef, fragmentCount: number,
                     hostElementSelector: string): RenderViewWithFragments {
    var s = this._createRootHostViewScope();
    var element = DOM.querySelector(this._document, hostElementSelector);
    if (isBlank(element)) {
      wtfLeave(s);
      throw new BaseException(`The selector "${hostElementSelector}" did not match any elements`);
    }
    return wtfLeave(s, this._createView(hostProtoViewRef, element));
  }

  _createViewScope = wtfCreateScope('DomRenderer#createView()');
  createView(protoViewRef: RenderProtoViewRef, fragmentCount: number): RenderViewWithFragments {
    var s = this._createViewScope();
    return wtfLeave(s, this._createView(protoViewRef, null));
  }

  private _createView(protoViewRef: RenderProtoViewRef,
                      inplaceElement: HTMLElement): RenderViewWithFragments {
    var view = createRenderView((<DefaultProtoViewRef>protoViewRef).cmds, inplaceElement, this);
    var sdRoots = view.nativeShadowRoots;
    for (var i = 0; i < sdRoots.length; i++) {
      this._domSharedStylesHost.addHost(sdRoots[i]);
    }
    return new RenderViewWithFragments(view, view.fragments);
  }

  destroyView(viewRef: RenderViewRef) {
    var view = <DefaultRenderView<Node>>viewRef;
    var sdRoots = view.nativeShadowRoots;
    for (var i = 0; i < sdRoots.length; i++) {
      this._domSharedStylesHost.removeHost(sdRoots[i]);
    }
  }

  getNativeElementSync(location: RenderElementRef): any {
    return resolveInternalDomView(location.renderView)
        .boundElements[location.renderBoundElementIndex];
  }

  getRootNodes(fragment: RenderFragmentRef): Node[] { return resolveInternalDomFragment(fragment); }

  attachFragmentAfterFragment(previousFragmentRef: RenderFragmentRef,
                              fragmentRef: RenderFragmentRef) {
    var previousFragmentNodes = resolveInternalDomFragment(previousFragmentRef);
    if (previousFragmentNodes.length > 0) {
      var sibling = previousFragmentNodes[previousFragmentNodes.length - 1];
      let nodes = resolveInternalDomFragment(fragmentRef);
      moveNodesAfterSibling(sibling, nodes);
      this.animateNodesEnter(nodes);
    }
  }

  /**
   * Iterates through all nodes being added to the DOM and animates them if necessary
   * @param nodes
   */
  animateNodesEnter(nodes: Node[]) {
    for (let i = 0; i < nodes.length; i++) this.animateNodeEnter(nodes[i]);
  }

  /**
   * Performs animations if necessary
   * @param node
   */
  animateNodeEnter(node: Node) {
    if (DOM.isElementNode(node) && DOM.hasClass(node, 'ng-animate')) {
      DOM.addClass(node, 'ng-enter');
      this._animate.css()
          .addAnimationClass('ng-enter-active')
          .start(<HTMLElement>node)
          .onComplete(() => { DOM.removeClass(node, 'ng-enter'); });
    }
  }

  /**
   * If animations are necessary, performs animations then removes the element; otherwise, it just
   * removes the element.
   * @param node
   */
  animateNodeLeave(node: Node) {
    if (DOM.isElementNode(node) && DOM.hasClass(node, 'ng-animate')) {
      DOM.addClass(node, 'ng-leave');
      this._animate.css()
          .addAnimationClass('ng-leave-active')
          .start(<HTMLElement>node)
          .onComplete(() => {
            DOM.removeClass(node, 'ng-leave');
            DOM.remove(node);
          });
    } else {
      DOM.remove(node);
    }
  }

  attachFragmentAfterElement(elementRef: RenderElementRef, fragmentRef: RenderFragmentRef) {
    var parentView = resolveInternalDomView(elementRef.renderView);
    var element = parentView.boundElements[elementRef.renderBoundElementIndex];
    var nodes = resolveInternalDomFragment(fragmentRef);
    moveNodesAfterSibling(element, nodes);
    this.animateNodesEnter(nodes);
  }

  _detachFragmentScope = wtfCreateScope('DomRenderer#detachFragment()');
  detachFragment(fragmentRef: RenderFragmentRef) {
    var s = this._detachFragmentScope();
    var fragmentNodes = resolveInternalDomFragment(fragmentRef);
    for (var i = 0; i < fragmentNodes.length; i++) {
      this.animateNodeLeave(fragmentNodes[i]);
    }
    wtfLeave(s);
  }

  hydrateView(viewRef: RenderViewRef) { resolveInternalDomView(viewRef).hydrate(); }

  dehydrateView(viewRef: RenderViewRef) { resolveInternalDomView(viewRef).dehydrate(); }

  createTemplateAnchor(attrNameAndValues: string[]): Node {
    return this.createElement('script', attrNameAndValues);
  }
  createElement(name: string, attrNameAndValues: string[]): Node {
    var el = DOM.createElement(name);
    this._setAttributes(el, attrNameAndValues);
    return el;
  }
  mergeElement(existing: Node, attrNameAndValues: string[]) {
    DOM.clearNodes(existing);
    this._setAttributes(existing, attrNameAndValues);
  }
  private _setAttributes(node: Node, attrNameAndValues: string[]) {
    for (var attrIdx = 0; attrIdx < attrNameAndValues.length; attrIdx += 2) {
      DOM.setAttribute(node, attrNameAndValues[attrIdx], attrNameAndValues[attrIdx + 1]);
    }
  }
  createShadowRoot(host: Node): Node { return DOM.createShadowRoot(host); }
  createText(value: string): Node { return DOM.createTextNode(isPresent(value) ? value : ''); }
  appendChild(parent: Node, child: Node) { DOM.appendChild(parent, child); }
  on(element: Node, eventName: string, callback: Function) {
    this._eventManager.addEventListener(<HTMLElement>element, eventName,
                                        decoratePreventDefault(callback));
  }
  globalOn(target: string, eventName: string, callback: Function): Function {
    return this._eventManager.addGlobalEventListener(target, eventName,
                                                     decoratePreventDefault(callback));
  }

  setElementProperty(location: RenderElementRef, propertyName: string, propertyValue: any): void {
    var view = resolveInternalDomView(location.renderView);
    DOM.setProperty(<Element>view.boundElements[location.renderBoundElementIndex], propertyName,
                    propertyValue);
  }

  setElementAttribute(location: RenderElementRef, attributeName: string, attributeValue: string):
      void {
    var view = resolveInternalDomView(location.renderView);
    var element = view.boundElements[location.renderBoundElementIndex];
    var dashCasedAttributeName = camelCaseToDashCase(attributeName);
    if (isPresent(attributeValue)) {
      DOM.setAttribute(element, dashCasedAttributeName, stringify(attributeValue));
    } else {
      DOM.removeAttribute(element, dashCasedAttributeName);
    }
  }

  setElementClass(location: RenderElementRef, className: string, isAdd: boolean): void {
    var view = resolveInternalDomView(location.renderView);
    var element = view.boundElements[location.renderBoundElementIndex];
    if (isAdd) {
      DOM.addClass(element, className);
    } else {
      DOM.removeClass(element, className);
    }
  }

  setElementStyle(location: RenderElementRef, styleName: string, styleValue: string): void {
    var view = resolveInternalDomView(location.renderView);
    var element = view.boundElements[location.renderBoundElementIndex];
    var dashCasedStyleName = camelCaseToDashCase(styleName);
    if (isPresent(styleValue)) {
      DOM.setStyle(element, dashCasedStyleName, stringify(styleValue));
    } else {
      DOM.removeStyle(element, dashCasedStyleName);
    }
  }

  invokeElementMethod(location: RenderElementRef, methodName: string, args: any[]): void {
    var view = resolveInternalDomView(location.renderView);
    var element = <Element>view.boundElements[location.renderBoundElementIndex];
    DOM.invoke(element, methodName, args);
  }

  setText(viewRef: RenderViewRef, textNodeIndex: number, text: string): void {
    var view = resolveInternalDomView(viewRef);
    DOM.setText(view.boundTextNodes[textNodeIndex], text);
  }

  setEventDispatcher(viewRef: RenderViewRef, dispatcher: RenderEventDispatcher): void {
    resolveInternalDomView(viewRef).setEventDispatcher(dispatcher);
  }
}

function resolveInternalDomView(viewRef: RenderViewRef): DefaultRenderView<Node> {
  return <DefaultRenderView<Node>>viewRef;
}

function resolveInternalDomFragment(fragmentRef: RenderFragmentRef): Node[] {
  return (<DefaultRenderFragmentRef<Node>>fragmentRef).nodes;
}

function moveNodesAfterSibling(sibling, nodes) {
  if (nodes.length > 0 && isPresent(DOM.parentElement(sibling))) {
    for (var i = 0; i < nodes.length; i++) {
      DOM.insertBefore(sibling, nodes[i]);
    }
    DOM.insertBefore(nodes[0], sibling);
  }
}

function moveChildNodes(source: Node, target: Node) {
  var currChild = DOM.firstChild(source);
  while (isPresent(currChild)) {
    var nextChild = DOM.nextSibling(currChild);
    DOM.appendChild(target, currChild);
    currChild = nextChild;
  }
}

function decoratePreventDefault(eventHandler: Function): Function {
  return (event) => {
    var allowDefaultBehavior = eventHandler(event);
    if (!allowDefaultBehavior) {
      // TODO(tbosch): move preventDefault into event plugins...
      DOM.preventDefault(event);
    }
  };
}
