'use strict';

var system = require('dw/system');
var dworder = require('dw/order');
var Resource = require('dw/web/Resource');
var Money = require('dw/value/Money');
var CustomerMgr = require('dw/customer/CustomerMgr');

var prefs = require('~/cartridge/config/braintreePreferences');

var paymentHelper = {};
const allowedProcessorsIds = ['BRAINTREE_CREDIT', 'BRAINTREE_PAYPAL', 'BRAINTREE_APPLEPAY', 'BRAINTREE_VENMO'];

/**
 * Parse error from API call
 * @param {Object} errorResponse error response from braintree
 * @returns {string} Parsed error
 */
paymentHelper.createErrorMessage = function (errorResponse) {
    var result = [];
    var errorMsg = null;

    /**
     * Parse error from API call
     * @param {Object} objectToBeParsed error response from braintree
     */
    function parseErrors(objectToBeParsed) {
        var obj = objectToBeParsed;
        if (typeof obj !== 'object') {
            return;
        }
        for (var name in obj) { // eslint-disable-line no-restricted-syntax
            if (String(name) === 'processorResponseText') {
                if (!obj.processorResponseCode) {
                    obj.processorResponseCode = 'unknown';
                }
                errorMsg = Resource.msg('braintree.server.processor.error.' + obj.processorResponseCode, 'locale', 'none');
                if (String(errorMsg) === 'none') {
                    errorMsg = obj.processorResponseText;
                }
                paymentHelper.getLogger().error(Resource.msgf('braintree.server.error.forlogger', 'locale', null, obj.processorResponseCode, obj.processorResponseText));
                result.push(errorMsg);
            }
            if (String(name) === 'errors' && obj[name] instanceof Array) {
                obj[name].forEach(function (error) { // eslint-disable-line no-loop-func
                    errorMsg = Resource.msg('braintree.server.error.' + error.code, 'locale', 'none');
                    if (String(errorMsg) === 'none') {
                        errorMsg = error.message;
                    }
                    paymentHelper.getLogger().error(Resource.msgf('braintree.server.error.forlogger', 'locale', null, error.code, error.message));
                    result.push(errorMsg);
                });
            } else {
                parseErrors(obj[name]);
            }
        }
    }

    if (!empty(errorResponse.message)) {
        result.push(errorResponse.message);
    }

    parseErrors(errorResponse);

    var filteredResult = result.filter(function (item, pos) {
        return result.indexOf(item) === pos;
    });


    return filteredResult.join('\n');
};

/**
 * Calculate amount of gift certificates in the order
 * @param {dw.order.Order} order Order object
 * @return {dw.value.Money} Certificates total
 */
paymentHelper.calculateAppliedGiftCertificatesAmount = function (order) {
    var amount = new Money(0, order.getCurrencyCode());
    var paymentInstruments = order.getGiftCertificatePaymentInstruments();

    var iterator = paymentInstruments.iterator();
    var paymentInstrument = null;
    while (iterator.hasNext()) {
        paymentInstrument = iterator.next();
        amount = amount.add(paymentInstrument.getPaymentTransaction().getAmount());
    }

    return amount;
};

/**
 * Calculate order amount
 * @param {dw.order.Order} order Order object
 * @return {dw.value.Money} New Amount value
 */
paymentHelper.getAmountPaid = function (order) {
    var appliedGiftCertificatesAmount = paymentHelper.calculateAppliedGiftCertificatesAmount(order);
    var amount = order.getTotalGrossPrice().subtract(appliedGiftCertificatesAmount);
    return amount;
};

/**
 * Creates or get logger
 *
 * @returns {Object} Object with logger for API operation
 */
paymentHelper.getLogger = function () {
    var errorMode = prefs().BRAINTREE_Logging_Mode !== 'none' && prefs().BRAINTREE_Logging_Mode;
    var logger = system.Logger.getLogger('Braintree', 'Braintree_General');

    return {
        error: function (msg) {
            if (errorMode) logger.error(msg);
        },
        info: function (msg) {
            if (errorMode && errorMode !== 'errors') logger.info(msg);
        },
        warn: function (msg) {
            if (errorMode && errorMode !== 'errors') logger.warn(msg);
        }
    };
};

/**
 * Check if Paypal button is enabled
 * @param {string} targetPage prefs value
 * @return {boolean} disabled or enabled
 */
paymentHelper.isPaypalButtonEnabled = function (targetPage) {
    var displayPages = prefs().BRAINTREE_PAYPAL_Button_Location.toLowerCase();
    if (displayPages === 'none' || !targetPage) {
        return false;
    }
    return displayPages.indexOf(targetPage) !== -1;
};

/**
 * Create address data
 * @param {dw.order.OrderAddress} address Address data from order
 * @return {Object} transformed data object
 */
paymentHelper.createAddressData = function (address) {
    return {
        company: address.getCompanyName(),
        countryCodeAlpha2: address.getCountryCode().getValue().toUpperCase(),
        countryName: address.getCountryCode().getDisplayValue(),
        firstName: address.getFirstName(),
        lastName: address.getLastName(),
        locality: address.getCity(),
        postalCode: address.getPostalCode(),
        region: address.getStateCode(),
        streetAddress: address.getAddress1(),
        extendedAddress: address.getAddress2(),
        phoneNumber: address.getPhone()
    };
};

/**
 * Get braintree payment instrument from array of payment instruments
 * @param {dw.order.LineItemCtnr} lineItemContainer Order object
 * @return {dw.order.OrderPaymentInstrument} Braintree Payment Instrument
 */
paymentHelper.getBraintreePaymentInstrument = function (lineItemContainer) {
    var paymentInstruments = lineItemContainer.getPaymentInstruments();

    var iterator = paymentInstruments.iterator();
    while (iterator.hasNext()) {
        var paymentInstrument = iterator.next();
        var paymentProcessorId = paymentInstrument.getPaymentTransaction().getPaymentProcessor().ID;
        if (allowedProcessorsIds.indexOf(paymentProcessorId) !== -1) {
            return paymentInstrument;
        }
    }
    return null;
};

/**
 * Delete all braintree payment instruments from the lineItemContainer
 * @param {dw.order.LineItemCtnr} lineItemContainer Order object
 */
paymentHelper.deleteBraintreePaymentInstruments = function (lineItemContainer) {
    var braintreePaymentInstrument = paymentHelper.getBraintreePaymentInstrument(lineItemContainer);
    if (braintreePaymentInstrument) {
        lineItemContainer.removePaymentInstrument(braintreePaymentInstrument);
    }
};

/**
 * Apply default shipping method for current cart
 * @param {dw.order.Basket} basket Active basket
 */
paymentHelper.addDefaultShipping = function (basket) {
    if (basket.getDefaultShipment().shippingMethod) {
        return;
    }
    var shippingMethod = dworder.ShippingMgr.getDefaultShippingMethod();
    system.Transaction.wrap(function () {
        basket.getDefaultShipment().setShippingMethod(shippingMethod);
        dworder.ShippingMgr.applyShippingCost(basket);
        system.HookMgr.callHook(Resource.msg('paypal.basketCalculateHookName', 'preferences', 'dw.order.calculate'), 'calculate', basket);
    });
};

paymentHelper.getNonGiftCertificateAmount = function (basket) {
    // The total redemption amount of all gift certificate payment instruments in the basket.
    var giftCertTotal = new Money(0.0, basket.getCurrencyCode());

    // Gets the list of all gift certificate payment instruments
    var gcPaymentInstrs = basket.getGiftCertificatePaymentInstruments();
    var iter = gcPaymentInstrs.iterator();
    var orderPI = null;

    // Sums the total redemption amount.
    while (iter.hasNext()) {
        orderPI = iter.next();
        giftCertTotal = giftCertTotal.add(orderPI.getPaymentTransaction().getAmount());
    }

    // Gets the order total.
    var orderTotal = basket.getTotalGrossPrice();

    // Calculates the amount to charge for the payment instrument.
    // This is the remaining open order total that must be paid.
    var amountOpen = orderTotal.subtract(giftCertTotal);

    // Returns the open amount to be paid.
    return amountOpen;
};

/**
 * Gets the order discount amount by subtracting the basket's total including the discount from
 * the basket's total excluding the order discount.
 *
 * @param {dw.order.LineItemCtnr} lineItemContainer - Current users's basket
 * @returns {string} string that contains the value order discount
 */
paymentHelper.getOrderLevelDiscountTotal = function (lineItemContainer) {
    return lineItemContainer.getAdjustedMerchandizeTotalPrice(false).subtract(lineItemContainer.getAdjustedMerchandizeTotalPrice(true)).getDecimalValue().toString();
};

/**
 * Gets required Level3 line items
 *
 * @param {dw.order.LineItemCtnr} dataLineItems - Current users's basket
 * @returns {Object} an object with required fields
 */
paymentHelper.getLineItems = function (dataLineItems) {
    return dataLineItems.toArray().map(function (value) {
        return {
            name: value.getProductName().substring(0, 30),
            kind: 'debit',
            quantity: value.getQuantityValue(),
            unitAmount: value.getProduct().getPriceModel().getPrice().toNumberString(),
            unitOfMeasure: value.getProduct().custom.unitOfMeasure || '',
            totalAmount: value.getPrice().toNumberString(),
            taxAmount: value.getTax().toNumberString(),
            discountAmount: value.getPrice().subtract(value.getProratedPrice()).getDecimalValue().toString(),
            productCode: value.getProduct().getUPC(),
            commodityCode: value.getProduct().custom.commodityCode || ''
        };
    });
};

paymentHelper.updateData = function (method, dataObject) {
    var customerProfile;
    if (method === 'removeCustomer' || method === 'bindCustomer') {
        var customerNumber = dataObject.customerId.substring(dataObject.customerId.indexOf('_') + 1);
        customerProfile = CustomerMgr.getProfile(customerNumber);
        system.Transaction.wrap(function () {
            customerProfile.custom.isBraintree = (method === 'bindCustomer');
        });
    } else if (method === 'updatePaymentMethod') {
        if (dataObject.deleteBillingAddress && dataObject.billingAddressId && dataObject.customerId) {
            var braintreeApiCalls = require('~/cartridge/scripts/braintree/braintreeAPI/braintreeApiCalls');
            braintreeApiCalls.deleteBillingAddress(dataObject.customerId, dataObject.billingAddressId);
        }
    } else if (method === 'deletePaymentMethod' && !empty(dataObject.customerId)) {
        var { getCustomerPaymentInstruments } = require('~/cartridge/scripts/braintree/helpers/customerHelper');
        var customerPaymentInstruments = getCustomerPaymentInstruments(dworder.PaymentInstrument.METHOD_CREDIT_CARD);
        customerProfile = CustomerMgr.getProfile(dataObject.customerId);
        if (!customerPaymentInstruments) {
            return;
        }
        var iterator = customerPaymentInstruments.iterator();
        var paymentInst = null;
        while (iterator.hasNext()) {
            paymentInst = iterator.next();
            if (dataObject.token === paymentInst.custom.braintreePaymentMethodToken) {
                try {
                    customerProfile.getWallet().removePaymentInstrument(paymentInst);
                } catch (error) {
                    throw new Error(error);
                }
            }
        }
    }
};

/**
 * Returns Active Payment Methods
 *
 * Setting isActive to true
 * Saves paymentMethodId to refs.paymentMethods
 *
 * @returns {Object} an object with active payment Methods
 */
paymentHelper.getActivePaymentMethods = function () {
    const activePaymentMethods = require('dw/order/PaymentMgr').getActivePaymentMethods();
    var paymentMethods = {
        BRAINTREE_CREDIT: {},
        BRAINTREE_PAYPAL: {},
        BRAINTREE_APPLEPAY: {},
        BRAINTREE_VENMO: {}
    };

    Array
        .filter(activePaymentMethods, function (paymentMethod) {
            return paymentMethod.paymentProcessor && allowedProcessorsIds.indexOf(paymentMethod.paymentProcessor.ID) !== -1;
        })
        .forEach(function (paymentMethod) {
            const processorId = paymentMethod.paymentProcessor.ID;
            paymentMethods[processorId] = {
                isActive: true,
                paymentMethodId: paymentMethod.ID
            };
        });

    return paymentMethods;
};

module.exports = paymentHelper;
