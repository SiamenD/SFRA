'use strict';

var { createAddressData } = require('~/cartridge/scripts/braintree/helpers/paymentHelper');
var { createCustomerId } = require('~/cartridge/scripts/braintree/helpers/customerHelper');

/**
 * Return request data for given API call method name
 * @param {string} method API call name
 * @param {Object} dataObj HTTP params from request
 * @return {Object} Formatted data for API call
 */
module.exports = function (method, dataObj) {
    var data;
    var dataObject = dataObj;

    if (empty(Object.keys(dataObj))) {
        throw new Error('No data provided for call');
    }

    switch (method) {
        case 'createCustomer':
            var billingAddress = dataObject.billingAddress;
            // Checks if BillingAddress is instance of dw.order.OrderAddress
            // eslint-disable-next-line no-undef
            if (billingAddress instanceof dw.order.OrderAddress) {
                billingAddress = createAddressData(billingAddress);
            }

            data = {
                xmlType: 'customer_create',
                requestPath: 'customers',
                customerId: dataObject.customerId,
                firstName: dataObject.firstName,
                lastName: dataObject.lastName,
                email: dataObject.email,
                company: dataObject.company,
                phone: dataObject.phone,
                fax: dataObject.fax,
                website: dataObject.website,
                paymentMethodNonce: dataObject.paymentMethodNonce,
                paypalPayeeEmail: dataObject.paypalPayeeEmail
            };

            if (dataObject.paymentMethodNonce) {
                data.creditCard = {
                    cardholderName: dataObject.cardholderName,
                    billingAddress: billingAddress,
                    makeDefault: dataObject.makeDefault,
                    verifyCard: dataObject.verifyCard,
                    token: dataObject.paymentMethodToken
                };
            }

            break;
        case 'findPaymentMethod':
            data = {
                xmlType: 'empty',
                requestPath: 'payment_methods/any/' + dataObject.token,
                requestMethod: 'GET'
            };
            break;
        case 'createPaymentMethod':
            data = {
                xmlType: 'payment_method',
                requestPath: 'payment_methods',
                customerId: dataObject.customerId,
                paymentMethodNonce: dataObject.paymentMethodNonce,
                billingAddress: dataObject.billingAddress,
                billingAddressId: dataObject.billingAddressId,
                makeDefault: dataObject.makeDefault,
                failOnDuplicatePaymentMethod: dataObject.failOnDuplicatePaymentMethod,
                verifyCard: dataObject.verifyCard,
                cardHolderName: dataObject.cardHolderName
            };
            break;
        case 'updatePaymentMethod':
            data = {
                xmlType: 'payment_method',
                requestPath: 'payment_methods/any/' + dataObject.token,
                requestMethod: 'PUT',
                customerId: dataObject.customerId,
                paymentMethodNonce: dataObject.paymentMethodNonce,
                billingAddress: dataObject.billingAddress,
                billingAddressId: dataObject.billingAddressId,
                makeDefault: dataObject.makeDefault,
                failOnDuplicatePaymentMethod: dataObject.failOnDuplicatePaymentMethod,
                verifyCard: dataObject.verifyCard,
                cardHolderName: dataObject.cardHolderName
            };

            if (data.billingAddress) {
                data.billingAddress.updateExisting = dataObject.bllingAddressUpdateExisting;
                data.billingAddressId = null;
            }
            break;
        case 'deletePaymentMethod':
            data = {
                xmlType: 'empty',
                requestPath: 'payment_methods/any/' + dataObject.token,
                requestMethod: 'DELETE'
            };
            break;
        case 'createAddress':
            data = createAddressData(dataObject.address);
            data.xmlType = 'address_create';
            data.requestPath = 'customers/' + createCustomerId(dataObject.customer) + '/addresses';
            break;
        case 'updateAddress':
            data = createAddressData(dataObject.address);
            data.xmlType = 'address_create';
            data.requestPath = 'customers/' + createCustomerId(dataObject.customer) + '/addresses/' + dataObject.address.custom.braintreeAddressId;
            data.requestMethod = 'PUT';
            break;
        case 'deleteAddress':
            data = {
                xmlType: 'empty',
                requestPath: 'customers/' + createCustomerId(dataObject.customer) + '/addresses/' + dataObject.address.custom.braintreeAddressId,
                requestMethod: 'DELETE'
            };
            break;
        default:
            throw new Error('No request data find for provided API method');
    }

    return data;
};
