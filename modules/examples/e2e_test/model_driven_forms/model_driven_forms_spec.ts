import {verifyNoBrowserErrors} from 'angular2/src/test_lib/e2e_util';

describe('Model-Driven Forms', function() {

  afterEach(verifyNoBrowserErrors);

  var URL = 'examples/src/model_driven_forms/index.html';

  it('should display errors', function() {
    browser.get(URL);

    var form = element.all(by.css('form')).first();
    var input = element.all(by.css('#creditCard')).first();
    var firstName = element.all(by.css('#firstName')).first();

    input.sendKeys('invalid');
    firstName.click();

    expect(form.getInnerHtml()).toContain('is invalid credit card number');
  });
});
