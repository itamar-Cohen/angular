import {isPresent, isBlank, isJsObject, isType, StringWrapper} from 'angular2/src/core/facade/lang';
import {BaseException, WrappedException} from 'angular2/src/core/facade/exceptions';
import {
  isListLikeIterable,
  Map,
  MapWrapper,
  ListWrapper,
  StringMap
} from 'angular2/src/core/facade/collection';

/**
 * Polyfill for [Headers](https://developer.mozilla.org/en-US/docs/Web/API/Headers/Headers), as
 * specified in the [Fetch Spec](https://fetch.spec.whatwg.org/#headers-class).
 *
 * The only known difference between this `Headers` implementation and the spec is the
 * lack of an `entries` method.
 *
 * ### Example ([live demo](http://plnkr.co/edit/MTdwT6?p=preview))
 *
 * ```
 * import {Headers} from 'angular2/http';
 *
 * var firstHeaders = new Headers();
 * firstHeaders.append('Content-Type', 'image/jpeg');
 * console.log(firstHeaders.get('Content-Type')) //'image/jpeg'
 *
 * // Create headers from Plain Old JavaScript Object
 * var secondHeaders = new Headers({
 *   'X-My-Custom-Header': 'Angular'
 * });
 * console.log(secondHeaders.get('X-My-Custom-Header')); //'Angular'
 *
 * var thirdHeaders = new Headers(secondHeaders);
 * console.log(thirdHeaders.get('X-My-Custom-Header')); //'Angular'
 * ```
 */
export class Headers {
  _headersMap: Map<string, string[]>;
  constructor(headers?: Headers | StringMap<string, any>) {
    if (isBlank(headers)) {
      this._headersMap = new Map<string, string[]>();
      return;
    }

    if (headers instanceof Headers) {
      this._headersMap = (<Headers>headers)._headersMap;
    } else if (headers instanceof StringMap) {
      this._headersMap = MapWrapper.createFromStringMap<string[]>(headers);
      MapWrapper.forEach(this._headersMap, (v, k) => {
        if (!isListLikeIterable(v)) {
          var list = [];
          list.push(v);
          this._headersMap.set(k, list);
        }
      });
    }
  }

  /**
   * Appends a header to existing list of header values for a given header name.
   */
  append(name: string, value: string): void {
    var mapName = this._headersMap.get(name);
    var list = isListLikeIterable(mapName) ? mapName : [];
    list.push(value);
    this._headersMap.set(name, list);
  }

  /**
   * Deletes all header values for the given name.
   */
  delete (name: string): void { MapWrapper.delete(this._headersMap, name); }

  forEach(fn: (value: string, name: string, headers: Headers) => any): void {
    MapWrapper.forEach(this._headersMap, fn);
  }

  /**
   * Returns first header that matches given name.
   */
  get(header: string): string { return ListWrapper.first(this._headersMap.get(header)); }

  /**
   * Check for existence of header by given name.
   */
  has(header: string): boolean { return this._headersMap.has(header); }

  /**
   * Provides names of set headers
   */
  keys(): string[] { return MapWrapper.keys(this._headersMap); }

  /**
   * Sets or overrides header value for given name.
   */
  set(header: string, value: string | string[]): void {
    var list = [];

    if (isListLikeIterable(value)) {
      var pushValue = (<string[]>value).join(',');
      list.push(pushValue);
    } else {
      list.push(value);
    }

    this._headersMap.set(header, list);
  }

  /**
   * Returns values of all headers.
   */
  values(): string[][] { return MapWrapper.values(this._headersMap); }

  /**
   * Returns list of header values for a given name.
   */
  getAll(header: string): string[] {
    var headers = this._headersMap.get(header);
    return isListLikeIterable(headers) ? headers : [];
  }

  /**
   * This method is not implemented.
   */
  entries() { throw new BaseException('"entries" method is not implemented on Headers class'); }
}
