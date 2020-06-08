/* eslint-disable no-inner-declarations */
'use strict';

/* global braintreeUtils braintree paypal $ */
var braintreeUtils = require('./braintreeUtils');
var loaderInstance = require('./loaderHelper');
var paypalHelper = require('./paypal/paypalHelper');

var bu = braintreeUtils;
var console = bu.console;

var pid;
var uuid;
var removeFromCartUrl;
var loader;
var $braintreePDPButton = document.querySelector('.braintree_pdp_button');
var $miniCartQuantity = document.querySelector('.minicart-quantity');
var $addToCartButton = document.querySelector('.add-to-cart');

function Constructor(initParams, $btn) {
    var params = initParams;
    this.params = initParams;
    params.options = params.options || {};

    this.$btn = $btn;
    var $errorContainer = document.createElement('div');
    $errorContainer.className = 'error';

    if (params.$errorContainer) {
        $errorContainer = params.$errorContainer;
        delete params.$errorContainer;
    }

    var $loaderContainter = document.querySelector('.braintreePayPalLoader');
    var $braintreePaypalRiskDataInput = document.querySelector('input[name=braintreePaypalRiskData]');

    if (params.$loaderContainer) {
        $loaderContainter = params.$loaderContainer;
    }

    $btn.parentNode.insertBefore($errorContainer, $btn.nextSibling);

    this.er = bu.createErrorInstance($errorContainer);
    loader = loaderInstance($loaderContainter);
    this.loader = loader;
    var that = this;

    if (params.isFraudToolsEnabled) {
        loader.show();
        braintree.dataCollector.create({
            authorization: bu.clientToken,
            paypal: true,
            kount: false
        }, function (error, data) {
            loader.hide();
            if (error) {
                console.log(error);
                return;
            }
            if ($braintreePaypalRiskDataInput) {
                $braintreePaypalRiskDataInput.value = data.deviceData;
            }
            params.riskData = data.deviceData;
        });
    }

    // Check minicart quantity and hide PDPbutton if it is not empty
    if ($miniCartQuantity && parseInt($miniCartQuantity.textContent, 0) > 0 && $braintreePDPButton) {
        $braintreePDPButton.style.display = 'none';
    }

    loader.show();

    braintree.client.create({
        authorization: bu.clientToken
    }, function (error, clientInstance) {
        if (error) {
            that.er.show(error);
            return;
        }

        braintree.paypalCheckout.create({
            authorization: bu.clientToken
        }, function (err, paypalCheckoutInstance) {
            if (err) {
                that.er.show(err);
                return;
            }
            if ($braintreePDPButton) {
                function hidePDPButton() {
                    $braintreePDPButton.style.display = 'none';
                }
                function showPDPButton() {
                    $braintreePDPButton.style.display = '';
                }

                if ($addToCartButton.disabled) {
                    hidePDPButton();
                }
                $('body').on('cart:update', function () {
                    $miniCartQuantity = parseInt(document.querySelector('.minicart-quantity').textContent, 0);
                    if ($addToCartButton.disabled) {
                        hidePDPButton();
                    }
                    if ($miniCartQuantity === 0 && !$addToCartButton.disabled) {
                        showPDPButton();
                    }
                });

                $('body').on('product:afterAddToCart', function () {
                    hidePDPButton();
                });

                // Update addToCart button status
                $('body').on('product:updateAddToCart', function () {
                    $miniCartQuantity = parseInt(document.querySelector('.minicart-quantity').textContent, 0);
                    if ($miniCartQuantity === 0) {
                        if ($addToCartButton.disabled) {
                            hidePDPButton();
                        }
                        if (!$addToCartButton.disabled) {
                            showPDPButton();
                        }
                    }
                });
            }

            var paypalButtonConfig = {
                env: clientInstance.getConfiguration().gatewayConfiguration.environment === 'production' ? 'production' : 'sandbox',
                payment: function () {
                    // https://braintree.github.io/braintree-web/current/PayPalCheckout.html#createPayment
                    if ($braintreePDPButton && $braintreePDPButton.style.display === '') {
                        that.er.hide();
                        paypal.Button.props.payment.timeout = 30000;
                        var res = braintreeUtils.pdpOnlickForAsignedPaypalPayment(paypalCheckoutInstance);
                        if (res.cart) {
                            uuid = res.pliUUID;
                            removeFromCartUrl = res.cart.actionUrls.removeProductLineItemUrl;
                            pid = res.pid;
                            that.params.options.amount = parseFloat(res.cart.totals.grandTotal.replace(/\$|,/g, ''));
                        } else {
                            throw new Error(res.message || 'Error occurs');
                        }
                    }

                    return paypalCheckoutInstance.createPayment(that.params.options);
                },
                locale: params.options.locale,
                commit: false,
                style: {
                    layout: 'vertical',  // horizontal | vertical
                    size: 'responsive',    // medium | large | responsive
                    shape: 'pill',      // pill | rect
                    color: 'gold'       // gold | blue | silver | black
                    // label: 'checkout',
                    // checkout The PayPal Checkout button. The default button.
                    // credit   The PayPal Credit button. Initializes the credit flow. Cannot be used with any custom color option.
                    // pay      The Pay With PayPal button. Initializes the checkout flow.
                    // buynow   The Buy Now button. Initializes the checkout flow. The default Buy Now button is unbranded. To include PayPal branding, set branding: true.
                    // paypal   The generic PayPal button. Initializes the checkout flow. This button contains only the PayPal brand logo.
                    // tagline: true, // false - to disable the tagline/text beneath the button
                    // maxbuttons: 4, //1-4
                    // fundingicons: true, // true  Displays funding instrument icons. Not valid for the credit button.
                    // false Hides funding instrument icons.
                },
                funding: {
                    allowed: [paypal.FUNDING.CARD, paypal.FUNDING.CREDIT, paypal.FUNDING.VENMO],
                    disallowed: []
                    // paypal.FUNDING.CREDIT    Allow buyers to pay with PayPal Credit.                 Enabled by default for US buyers.
                    // paypal.FUNDING.CARD      Allow buyers to pay with their credit or debit card     Enabled by default for all buyers.
                    // paypal.FUNDING.ELV       Allow German buyers to pay with their bank account      Enabled by default for DE buyers.
                },
                onAuthorize: function (data, actions) {
                    return new paypal.Promise(function (resolve, reject) {
                        paypalCheckoutInstance.tokenizePayment(data).then(function (payload) {
                            params.onTokenizePayment(payload, resolve, reject, actions, that);
                        }).catch(function (err) {
                            loader.hide();
                            if (err) {
                                that.er.show(err);
                                return;
                            }
                        });
                    });
                },
                onCancel: function (a, b) {
                    if (typeof params.options.onCancel === 'function') {
                        params.options.onCancel(a, b);
                    }
                    if ($braintreePDPButton && $braintreePDPButton.style.display === '') {
                        var urlParams = {
                            pid: pid,
                            uuid: uuid
                        };

                        $.ajax({
                            url: paypalHelper.appendToUrl(removeFromCartUrl, urlParams),
                            type: 'get',
                            dataType: 'json',
                            success: function () {
                                $.spinner().stop();
                            },
                            error: function () {
                                $.spinner().stop();
                            }
                        });
                    }
                },
                onError: function (err) {
                    that.er.show(err.message.split(/\r?\n/g)[0]);

                    if ($braintreePDPButton && $braintreePDPButton.style.display === '' && pid) {
                        var productID = pid;
                        var urlParams = {
                            pid: productID,
                            uuid: uuid
                        };

                        $.ajax({
                            url: paypalHelper.appendToUrl(removeFromCartUrl, urlParams),
                            type: 'get',
                            dataType: 'json',
                            success: function () {
                                $.spinner().stop();
                            },
                            error: function () {
                                $.spinner().stop();
                            }
                        });
                    }
                }
            };

            paypalButtonConfig = $.extend(false, paypalButtonConfig, that.params.paypalConfig);

            if (that.params.paypalConfig.bmConfigurationInvalid) {
                console.error('Invalid configuration in BM: Merchant Tools > Site Preferences > Custom Preference > BRAINTREE_PAYPAL > Field: ' + that.params.paypalConfig.bmConfigurationInvalid);
                return;
            }
            paypal.Button.render(paypalButtonConfig, that.$btn).then(function () {
                loader.hide();
            });
        });
    });
}

Constructor.prototype.updateAmount = function (amount) {
    this.params.options.amount = amount;
};

Constructor.prototype.updateShippingAddress = function (data) {
    this.params.options.shippingAddressOverride = data;
};

module.exports = {
    init: function (params, $btn) {
        bu.clientToken = params.clientToken;
        $.extend(bu.messages, params.messages);
        return new Constructor(params, $btn);
    }
};
