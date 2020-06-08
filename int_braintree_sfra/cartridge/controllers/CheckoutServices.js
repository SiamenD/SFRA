'use strict';

var page = module.superModule;
var server = require('server');

var StringUtils = require('dw/util/StringUtils');
var Money = require('dw/value/Money');
var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');
server.extend(page);

/**
 * Gets payment instrument PayPal
 *
 * @param {dw.util.Collection}  paymentInstruments customers current basket profile wallet payment instruments
 * @returns {Object}  Current PayPal instrument/s
 */
function paymentInstrumentsPaypal(paymentInstruments) {
    return Array.filter(paymentInstruments, function (paymentInstrument) {
        return paymentInstrument.paymentMethod.indexOf('PayPal') !== -1;
    });
}

server.prepend('SubmitPayment', server.middleware.https, csrfProtection.validateAjaxRequest, function (req, res, next) {
    var isBraintree = request.httpParameterMap.isBraintree.booleanValue;

    if (!isBraintree) {
        next();
        return;
    }

    var data = res.getViewData();
    if (data && data.csrfError) {
        res.json();
        this.emit('route:Complete', req, res);
        return;
    }

    var HookMgr = require('dw/system/HookMgr');
    var Resource = require('dw/web/Resource');
    var PaymentMgr = require('dw/order/PaymentMgr');
    var Transaction = require('dw/system/Transaction');
    var AccountModel = require('*/cartridge/models/account');
    var OrderModel = require('*/cartridge/models/order');
    var Locale = require('dw/util/Locale');
    var URLUtils = require('dw/web/URLUtils');
    var BasketMgr = require('dw/order/BasketMgr');
    var currentBasket = BasketMgr.getCurrentBasket();
    var emailHelper = require('*/cartridge/scripts/helpers/emailHelpers');
    var creditCardNumber = request.httpParameterMap.braintreeCardMaskNumber.value;

    if (!currentBasket) {
        res.json({
            error: true,
            cartError: true,
            fieldErrors: [],
            serverErrors: [],
            redirectUrl: URLUtils.url('Cart-Show').toString()
        });
        this.emit('route:Complete', req, res);
        return;
    }

    var billingForm = server.forms.getForm('billing');
    var viewData = {};

    var paymentMethodID = billingForm.paymentMethod.value;
    viewData.paymentMethod = {
        value: paymentMethodID,
        htmlName: billingForm.paymentMethod.htmlName
    };

    var billingFormErrors = COHelpers.validateBillingForm(billingForm.addressFields);
    var billingFormContactInfoErrors = COHelpers.validateBillingForm(billingForm.contactInfoFields);
    var creditCardErrors = COHelpers.validateCreditCard(billingForm);

    var selectedCreditCardUuid = request.httpParameterMap.braintreeCreditCardList.stringValue;
    var selectedPaypalAccountUuid = request.httpParameterMap.braintreePaypalAccountList.stringValue;
    session.custom.showPaypalLists = false;
    var isUsedSavedCardMethod = selectedCreditCardUuid !== null && selectedCreditCardUuid !== 'newcard';
    var isUsedSavedPaypalMethod = selectedPaypalAccountUuid !== null && selectedPaypalAccountUuid !== 'newaccount';

    if (Object.keys(billingFormErrors).length || Object.keys(billingFormContactInfoErrors).length) {
        res.json({
            form: billingForm,
            fieldErrors: [billingFormErrors, creditCardErrors, billingFormContactInfoErrors],
            serverErrors: [],
            error: true,
            paymentMethod: viewData.paymentMethod
        });
        this.emit('route:Complete', req, res);
        return;
    }

    viewData.address = {
        firstName: { value: billingForm.addressFields.firstName.value },
        lastName: { value: billingForm.addressFields.lastName.value },
        address1: { value: billingForm.addressFields.address1.value },
        address2: { value: billingForm.addressFields.address2.value },
        city: { value: billingForm.addressFields.city.value },
        postalCode: { value: billingForm.addressFields.postalCode.value },
        countryCode: { value: billingForm.addressFields.country.value }
    };

    if (Object.prototype.hasOwnProperty.call(billingForm.addressFields, 'states')) {
        viewData.address.stateCode = {
            value: billingForm.addressFields.states.stateCode.value
        };
    }

    if (!emailHelper.validateEmail(billingForm.contactInfoFields.email.value)) {
        next();
        return;
    }

    var emailFromFillingPage = billingForm.contactInfoFields.email.value;
    var email = billingForm.contactInfoFields.email.value;
    if (isUsedSavedCardMethod || isUsedSavedPaypalMethod || customer.authenticated) {
        email = customer.getProfile().getEmail();
        if (!isUsedSavedPaypalMethod && paymentInstrumentsPaypal(currentBasket.customer.profile.wallet.paymentInstruments).length) {
            session.custom.showPaypalLists = true;
        }
    } else if (paymentMethodID === 'PayPal') {
        var braintreePaypalBillingAddress = request.httpParameterMap.braintreePaypalBillingAddress.stringValue;
        if (!empty(braintreePaypalBillingAddress) && braintreePaypalBillingAddress !== '{}') {
            var newBilling = JSON.parse(braintreePaypalBillingAddress);
            email = newBilling.email;
        }
    }
    viewData.email = {
        value: email
    };

    res.setViewData(viewData);

    var billingAddress = currentBasket.billingAddress;
    Transaction.wrap(function () {
        if (!billingAddress) {
            billingAddress = currentBasket.createBillingAddress();
        }

        billingAddress.setFirstName(billingForm.addressFields.firstName.value);
        billingAddress.setLastName(billingForm.addressFields.lastName.value);
        billingAddress.setAddress1(billingForm.addressFields.address1.value);
        billingAddress.setAddress2(billingForm.addressFields.address2.value);
        billingAddress.setCity(billingForm.addressFields.city.value);
        billingAddress.setPostalCode(billingForm.addressFields.postalCode.value);
        billingAddress.setCountryCode(billingForm.addressFields.country.value);
        if (Object.prototype.hasOwnProperty.call(billingForm.addressFields, 'states')) {
            billingAddress.setStateCode(billingForm.addressFields.states.stateCode.value);
        }
        currentBasket.setCustomerEmail(email);
        session.forms.billing.creditCardFields.cardNumber.value = creditCardNumber;
        billingForm.contactInfoFields.email.value = email;
    });

    Transaction.wrap(function () {
        HookMgr.callHook('dw.order.calculate', 'calculate', currentBasket);
    });

    var processor = PaymentMgr.getPaymentMethod(paymentMethodID).getPaymentProcessor();
    if (!processor) {
        throw new Error(Resource.msg('error.payment.processor.missing', 'checkout', null));
    }

    var processorResult = null;
    if (HookMgr.hasHook('app.payment.processor.' + processor.ID.toLowerCase())) {
        processorResult = HookMgr.callHook('app.payment.processor.' + processor.ID.toLowerCase(), 'Handle', currentBasket);
    } else {
        throw new Error('File of app.payment.processor.' + processor.ID.toLowerCase() + ' hook is missing or the hook is not configured');
    }

    if (processorResult.error) {
        res.json({
            form: billingForm,
            fieldErrors: processorResult.fieldErrors || [],
            serverErrors: processorResult.serverErrors || [],
            error: true
        });
        this.emit('route:Complete', req, res);
        return;
    }

    var usingMultiShipping = false; // Current integration support only single shpping
    req.session.privacyCache.set('usingMultiShipping', usingMultiShipping);

    if (emailFromFillingPage !== null) {
        Transaction.wrap(function () {
            currentBasket.setCustomerEmail(emailFromFillingPage);
        });
    }

    var currentLocale = Locale.getLocale(req.locale.id);
    var basketModel = new OrderModel(currentBasket, { usingMultiShipping: usingMultiShipping, countryCode: currentLocale.country, containerView: 'basket' });
    var accountModel = new AccountModel(req.currentCustomer);
    var paymentInstrument = basketModel.billing.payment.selectedPaymentInstruments[0];

    paymentInstrument.name = PaymentMgr.getPaymentMethod(basketModel.billing.payment.selectedPaymentInstruments[0].paymentMethod).getName();
    paymentInstrument.amount = StringUtils.formatMoney(new Money(basketModel.billing.payment.selectedPaymentInstruments[0].amount, currentBasket.getCurrencyCode()));
    paymentInstrument.creditCardNumber = creditCardNumber;

    res.json({
        renderedPaymentInstruments: COHelpers.getRenderedPaymentInstruments(req, accountModel),
        customer: accountModel,
        order: basketModel,
        paypalProcessorResult: processorResult,
        form: billingForm,
        error: false
    });
    this.emit('route:Complete', req, res);
});

module.exports = server.exports();
