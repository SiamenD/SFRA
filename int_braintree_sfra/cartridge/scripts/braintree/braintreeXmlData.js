module.exports = function(xmlDataType, data) {
    var prefs = require('~/cartridge/config/braintreePreferences')();
	switch (xmlDataType) {
        case 'client_token':
            var xmlObj =  <client_token>
                            <version type="integer">2</version>
                            <merchant-account-id/>
                        </client_token>;
            return xmlObj.toXMLString();
        case 'customer':
            var xmlObj = <customer>
                            <id>{data.id}</id>
                            <first-name>{data.firstName}</first-name>
                            <last-name>{data.lastName}</last-name>
                            <company>{data.company}</company>
                            <phone>{data.phone}</phone>
                            <fax>{data.fax}</fax>
                            <email>{data.email}</email>
                        </customer>;
            return xmlObj.toXMLString();
        case 'billing': 
            var xmlObj = <billing>
                            <first-name>{data.firstName}</first-name>
                            <last-name>{data.lastName}</last-name>
                            <company>{data.company}</company>
                            <street-address>{data.streetAddress}</street-address>
                            <extended-address>{data.extendedAddress}</extended-address>
                            <locality>{data.locality}</locality>
                            <region>{data.region}</region>
                            <postal-code>{data.postalCode}</postal-code>
                            <country-code-alpha2>{data.countryCodeAlpha2}</country-code-alpha2>
                            <country-name>{data.countryName}</country-name>
                        </billing>;
            return xmlObj.toXMLString();
        case 'billing_address':
            var xmlObj = <billing-address>
                            <first-name>{data.firstName}</first-name>
                            <last-name>{data.lastName}</last-name>
                            <company>{data.company}</company>
                            <street-address>{data.streetAddress}</street-address>
                            <extended-address>{data.extendedAddress}</extended-address>
                            <locality>{data.locality}</locality>
                            <region>{data.region}</region>
                            <postal-code>{data.postalCode}</postal-code>
                            <country-code-alpha2>{data.countryCodeAlpha2}</country-code-alpha2>
                            <country-name>{data.countryName}</country-name>
                            <options/>
                        </billing-address>;
            return xmlObj.toXMLString();
        case 'shipping':
            var xmlObj = <shipping>
                            <first-name>{data.firstName}</first-name>
                            <last-name>{data.lastName}</last-name>
                            <company>{data.company}</company>
                            <street-address>{data.streetAddress}</street-address>
                            <extended-address>{data.extendedAddress}</extended-address>
                            <locality>{data.locality}</locality>
                            <region>{data.region}</region>
                            <postal-code>{data.postalCode}</postal-code>
                            <country-code-alpha/>
                            <country-name>{data.countryName}</country-name>
                        </shipping>;
            return xmlObj.toXMLString();
        case 'transaction_amount':
            var xmlObj = <transaction>
                            <amount/>
                            <order-id>{data.orderId}</order-id>
                        </transaction>;
            return xmlObj.toXMLString();
        case 'descriptor':
            var xmlObj = <descriptor>
                            <name/>
                            <phone/>
                            <url/>
                        </descriptor>;
            return xmlObj.toXMLString();
        case 'transaction':
            var xmlObj = <transaction>
                            <merchant-account-id/>
                            <type>sale</type>
                            <order-id>{data.orderId}</order-id>
                            <amount>{data.amount}</amount>
                            <payment-method-identificator/>
                            <customer/>
                            <customer-id>{data.customerId}</customer-id>
                            <billing/>
                            <billing-address-id/>
                            <shipping-address-id/>
                            <shipping/>
                            <options>
                                <add-billing-address-to-payment-method/>
                                <store-in-vault/>
                                <store-in-vault-on-success/>
                                <submit-for-settlement type="boolean">{data.options.submitForSettlement}</submit-for-settlement>
                                <three_d_secure/>
                                <paypal/>
                            </options>
                            <descriptor/>
                            <device-data/>
                            <channel>{prefs.braintreeChannel}</channel>
                            <custom-fields/>
                            <purchase-order-number/>
                            <tax-amount/>
                            <shipping-amount/>
                            <discount-amount/>
                            <ships-from-postal-code/>
                            <line-items/>
                            <transaction-source>unscheduled</transaction-source>
                        </transaction>;
            return xmlObj.toXMLString();
        case 'transaction_clone':
            var xmlObj = <transaction-clone>
                            <amount>{data.amount}</amount>
                            <options>
                                <submit-for-settlement>{data.isSubmitForSettlement}</submit-for-settlement>
                            </options>
                        </transaction-clone>;
            return xmlObj.toXMLString();
        case 'transactions_search':
                var xmlObj = <search>
                                <created_at>
                                    <min type="datetime">{data.startDate}</min>
                                    <max type="datetime">{data.endDate}</max>
                                </created_at>
                            </search>;
                return xmlObj.toXMLString();
        case 'payment_method':
                var xmlObj = <payment-method>
                                <customer-id/>
                                <payment-method-nonce/>
                                <billing-address-id/>
                                <billing-address/>
                                <cardholder-name>{data.cardHolderName}</cardholder-name>
                                <options>
                                    <make-default>{data.makeDefault}</make-default>
                                    <fail-on-duplicate-payment-method>{data.failOnDuplicatePaymentMethod}</fail-on-duplicate-payment-method>
                                    <verify-card>{data.verifyCard}</verify-card>
                                </options>
                            </payment-method>;
                return xmlObj.toXMLString();
        case 'credit_card':
                var xmlObj = <credit-card>
                                <billing-address/>
                                <cardholder-name>{data.cardholderName}</cardholder-name>
                                <options>
                                    <make-default>{data.makeDefault}</make-default>
                                    <verify-card>{data.verifyCard}</verify-card>
                                    <token>{data.token}</token>
                                </options>
                            </credit-card>;
                return xmlObj.toXMLString();
        case 'customer_create':
                var xmlObj = <customer>
                                <id>{data.customerId}</id>
                                <first-name>{data.firstName}</first-name>
                                <last-name>{data.lastName}</last-name>
                                <email>{data.email}</email>
                                <company>{data.company}</company>
                                <phone>{data.phone}</phone>
                                <fax>{data.fax}</fax>
                                <website>{data.website}</website>
                                <credit-card/>
                                <options>
                                    <paypal-payee-email/>
                                </options>
                            </customer>;
                return xmlObj.toXMLString();
        case 'transactuion_create_vault':
                var xmlObj = <transaction>
                                <merchant-account-id/>
                                <type>sale</type>
                                <order-id/>
                                <payment-method-token>{data.token}</payment-method-token>
                                <tax-amount/>
                                <custom-fields/>
                                <amount>{data.amount}</amount>
                                <options>
                                    <submit-for-settlement type="boolean">{data.submitForSettlement}</submit-for-settlement>
                                </options>
                                <transaction-source>moto</transaction-source>
                            </transaction>;
                return xmlObj.toXMLString();
        case 'transaction_create':
                var xmlObj = <transaction>
                                <merchant-account-id/>
                                <type>sale</type>
                                <payment-method-nonce>{data.nonce}</payment-method-nonce>
                                <tax-amount>{data.tax}</tax-amount>
                                <custom-fields/>
                                <amount>{data.amount}</amount>
                                <options>
                                    <submit-for-settlement type="boolean">{data.options.submitForSettlement}</submit-for-settlement>
                                    <store-in-vault-on-success type="boolean">{data.options.submitForSettlement}</store-in-vault-on-success>
                                    <store-in-vault type="boolean">{data.options.submitForSettlement}</store-in-vault>
                                </options>
                                <shipping>
                                    <street-address>{data.shippingStreetAddress}</street-address>
                                    <postal-code>{data.shippingPostalCode}</postal-code>
                                </shipping>
                                <customer>
                                    <first-name>{data.firstName}</first-name>
                                    <last-name>{data.lastName}</last-name>
                                </customer>
                                <billing>
                                    <street-address>{data.billingStreetAddress}</street-address>
                                    <postal-code>{data.billingPostalCode}</postal-code>
                                </billing>
                                <transaction-source>moto</transaction-source>
                            </transaction>;
                return xmlObj.toXMLString();
        case 'customer_update':
                var xmlObj = <customer>
                                <first-name>{data.firstName}</first-name>
                                <last-name>{data.lastName}</last-name>
                                <email>{data.email}</email>
                                <company>{data.company}</company>
                                <phone>{data.phone}</phone>
                                <fax>{data.fax}</fax>
                                <website>{data.website}</website>
                            </customer>;
                return xmlObj.toXMLString();
        case 'address_create':
                var xmlObj = <address>
                                <first-name>{data.firstName}</first-name>
                                <last-name>{data.lastName}</last-name>
                                <company>{data.company}</company>
                                <street-address>{data.streetAddress}</street-address>
                                <extended-address>{data.extendedAddress}</extended-address>
                                <locality>{data.locality}</locality>
                                <region>{data.region}</region>
                                <postal-code>{data.postalCode}</postal-code>
                                <country-code-alpha2>{data.countryCodeAlpha2}</country-code-alpha2>
                                <country-name>{data.countryName}</country-name>
                            </address>;
                return xmlObj.toXMLString();
        default:
            break;
    }
};
