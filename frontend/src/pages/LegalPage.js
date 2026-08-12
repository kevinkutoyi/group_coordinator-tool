import React, { useEffect } from "react";

const LAST_UPDATED = "August 2026";

const CONTENT = {
  terms: {
    title: "Terms and Conditions",
    metaDesc: "SplitSubs Terms and Conditions — the marketplace, payment, seller, buyer, and dispute rules governing use of the platform.",
    lastUpdated: "12 August 2026",
    intro: [
      "Welcome to SplitSubs.",
      `These Terms and Conditions ("Terms" or "Agreement") govern your access to and use of the SplitSubs website, applications, marketplace, payment services, subscription-sharing services, digital products, communications, and related services (collectively, the "Platform" or "Services").`,
      "By creating an account, accessing the Platform, purchasing or listing a product or subscription, making a payment, or otherwise using the Services, you agree to be legally bound by these Terms.",
      "If you do not agree to these Terms, you must not use the Platform.",
      "These Terms form a legally binding agreement between you and SplitSubs.",
    ],
    sections: [
      ["1. About SplitSubs", [
        "SplitSubs is a digital marketplace and technology platform that facilitates access to digital products, subscriptions, subscription-sharing arrangements, digital services, and related offerings provided by SplitSubs, third-party sellers, subscription owners, partners, or other users.",
        "Depending on the product or transaction, SplitSubs may act as:",
        { type: "ul", items: [
          "a marketplace operator;",
          "a technology platform;",
          "a payment and transaction facilitator;",
          "an intermediary between users;",
          "a subscription-sharing facilitator;",
          "a reseller or distributor; or",
          "a direct provider of certain products or services.",
        ]},
        "The specific role of SplitSubs in any transaction is determined by the product, seller, payment arrangement, and information displayed at the time of purchase.",
        "Unless expressly stated otherwise, SplitSubs is not the owner, publisher, developer, manufacturer, or operator of any third-party digital service. Third-party services may include streaming platforms, productivity tools, AI services, software, educational platforms, cloud services, and other digital products.",
      ]],
      ["2. Definitions", [
        { type: "ul", items: [
          `"SplitSubs", "we", "us", or "our" means the SplitSubs platform and its owners, operators, employees, contractors, affiliates, and authorised representatives.`,
          `"User", "you", or "your" means any person accessing or using the Platform.`,
          `"Buyer" means a User who purchases or subscribes to a product or service through the Platform.`,
          `"Seller" means a User, business, partner, or other party that lists, supplies, sells, distributes, or provides access to a product or subscription through the Platform.`,
          `"Subscription Owner" means a person who owns or controls an underlying subscription and makes one or more permitted slots, seats, or access rights available through the Platform.`,
          `"Listing" means any product, subscription, service, account, seat, slot, digital good, or offer displayed on the Platform.`,
          `"Third-Party Service" means any service operated by a party other than SplitSubs.`,
          `"Transaction" means a purchase, subscription, renewal, payment, refund, credit, payout, or other financial activity conducted through the Platform.`,
          `"Platform Wallet" means any balance, credit, or account value maintained within SplitSubs.`,
          `"Content" includes text, images, graphics, logos, videos, descriptions, listings, reviews, messages, and other material submitted to or displayed on the Platform.`,
        ]},
      ]],
      ["3. Eligibility", [
        "You must be legally capable of entering into a binding agreement to use the Platform.",
        "By using SplitSubs, you represent and warrant that:",
        { type: "ol", items: [
          "the information you provide is accurate and complete;",
          "you will maintain accurate account information;",
          "you will comply with all applicable laws;",
          "you will comply with these Terms;",
          "you will not use another person's identity or payment credentials without authorisation; and",
          "you are not using the Platform for fraudulent, unlawful, or abusive purposes.",
        ]},
        "SplitSubs may restrict certain products, payment methods, or Services based on age, location, regulatory requirements, risk level, or other legitimate considerations.",
      ]],
      ["4. Account Registration", [
        "Certain Services require an account. You are responsible for:",
        { type: "ul", items: [
          "maintaining the confidentiality of your login credentials;",
          "all activity under your account;",
          "keeping your account information accurate;",
          "securing your email address and devices; and",
          "promptly notifying SplitSubs of any unauthorised access.",
        ]},
        "You must not:",
        { type: "ul", items: [
          "create accounts using false identities;",
          "impersonate another person;",
          "create accounts for fraudulent purposes;",
          "maintain multiple accounts to circumvent restrictions;",
          "sell, rent, or transfer your account;",
          "allow another person to use your account where prohibited; or",
          "use another person's account without authorisation.",
        ]},
        "SplitSubs may require identity verification or additional information for security, fraud prevention, payment processing, regulatory compliance, or account recovery.",
      ]],
      ["5. Marketplace Model", [
        "SplitSubs allows Users to list and purchase digital products and subscription access.",
        "Unless expressly stated otherwise, SplitSubs does not guarantee that:",
        { type: "ul", items: [
          "every Listing is authentic;",
          "every Seller will perform their obligations;",
          "every subscription will remain available;",
          "a Third-Party Service will continue operating or permit sharing;",
          "a Seller will maintain access for the entire advertised period;",
          "a Third-Party Service will not change its pricing or policies; or",
          "a Listing will remain available.",
        ]},
        "Buyers are responsible for carefully reviewing all information provided with a Listing before completing a Transaction.",
        "SplitSubs may review, approve, reject, modify, restrict, suspend, or remove any Listing at any time.",
      ]],
      ["6. Seller Responsibilities", [
        "Sellers are solely responsible for the products and services they list (subject to SplitSubs' role in facilitating the marketplace).",
        "A Seller represents and warrants that:",
        { type: "ol", items: [
          "they have the legal right to provide the advertised product or access;",
          "the Listing information is accurate;",
          "the Listing does not knowingly infringe third-party rights;",
          "the Listing does not involve stolen, compromised, or unlawfully obtained accounts;",
          "they will not knowingly provide fraudulent credentials;",
          "they will deliver the advertised service or access;",
          "they will comply with applicable laws and the rules of the relevant Third-Party Service; and",
          "they will not intentionally mislead Buyers.",
        ]},
        "SplitSubs may request evidence of ownership, purchase, authorisation, identity, or legitimacy. Failure to provide satisfactory evidence may result in Listing removal, account suspension, payout delay or hold, transaction cancellation, refunds to affected Buyers, or permanent account termination.",
      ]],
      ["7. Third-Party Subscriptions", [
        "Many products available through SplitSubs depend on Third-Party Services that are independent of SplitSubs. Their terms, policies, pricing, technical requirements, geographical restrictions, and account-sharing rules may change without notice to SplitSubs.",
        "You acknowledge that SplitSubs cannot guarantee that a Third-Party Service will continue permitting any particular sharing arrangement.",
        "If a Third-Party Service changes its policies, terminates an account, changes pricing, restricts geographical access, modifies household/family/team rules, or otherwise affects access, SplitSubs may, at its discretion:",
        { type: "ul", items: [
          "replace or modify the Listing;",
          "suspend or terminate the affected service;",
          "provide a replacement;",
          "issue a partial or full refund where appropriate; or",
          "provide another remedy determined by SplitSubs.",
        ]},
        "Nothing in these Terms constitutes a representation that SplitSubs is endorsed, sponsored, authorised, or affiliated with any Third-Party Service unless expressly stated.",
      ]],
      ["8. Prohibited Listings", [
        "The following are strictly prohibited unless expressly authorised by SplitSubs:",
        { type: "ul", items: [
          "stolen, hacked, or compromised accounts or credentials;",
          "illegally obtained subscriptions;",
          "fraudulent payment methods;",
          "counterfeit digital products;",
          "unauthorised access credentials;",
          "malware or phishing services;",
          "services intended to facilitate cybercrime;",
          "illegal gambling, drugs, weapons, or terrorist/extremist material;",
          "sexually exploitative material or any content involving exploitation of minors;",
          "fraudulent identity documents or stolen personal information;",
          "financial account credentials;",
          "products that infringe intellectual-property rights;",
          "products that violate applicable law or payment-provider rules; and",
          "any product or service that SplitSubs determines presents unacceptable legal, security, reputational, or operational risk.",
        ]},
        "SplitSubs may prohibit additional categories at any time.",
      ]],
      ["9. Buyer Responsibilities", [
        "Before purchasing, you should carefully review the product description, duration, access method, number of seats/users, geographical restrictions, renewal and refund conditions, Seller information, limitations, and any other information presented at checkout.",
        "You must not:",
        { type: "ul", items: [
          "share credentials beyond the permitted number of users;",
          "change passwords or security settings without authorisation;",
          "remove other authorised users;",
          "misuse a subscription or attempt unauthorised access;",
          "reverse-engineer the Platform or exploit technical vulnerabilities;",
          "resell access without authorisation;",
          "circumvent Platform fees;",
          "commit fraud; or",
          "interfere with another User's access.",
        ]},
      ]],
      ["10. Shared Accounts and Credentials", [
        "Where a Listing involves shared credentials, invitation links, family groups, team seats, or similar arrangements, access is limited strictly to the number of users or seats stated in the Listing.",
        "You must keep credentials confidential where required and must not:",
        { type: "ul", items: [
          "distribute credentials publicly;",
          "sell or transfer credentials;",
          "share them with unauthorised persons;",
          "modify security information without permission;",
          "attempt to lock other users out or take ownership of an account;",
          "use technical methods to bypass restrictions; or",
          "use the access in a manner that violates the Third-Party Service's policies.",
        ]},
        "SplitSubs may immediately suspend access where misuse or security risk is suspected.",
      ]],
      ["11. Pricing", [
        "Prices are displayed on the Platform and may change at any time. Unless expressly stated otherwise, the price displayed at checkout is the price applicable to that Transaction.",
        "SplitSubs may correct pricing, typographical, or technical errors. In the case of an obvious pricing error, SplitSubs may cancel the affected Transaction and refund the amount paid. Promotional prices may be subject to additional conditions.",
      ]],
      ["12. Payments", [
        "Payments may be processed by SplitSubs or third-party payment providers. By submitting a payment method, you authorise the applicable provider and/or SplitSubs to process the Transaction.",
        "You represent that you are authorised to use the payment method, that the information is accurate, and that the Transaction is legitimate.",
        "SplitSubs may decline, delay, reverse, or place a hold on a Transaction where it reasonably suspects fraud, unauthorised payment, chargeback abuse, money laundering, account takeover, payment manipulation, violation of these Terms, suspicious activity, or regulatory/payment-provider concerns.",
      ]],
      ["13. Seller Payouts", [
        "Seller funds may be subject to a settlement or holding period. SplitSubs may delay or withhold a payout while investigating Buyer complaints, suspected fraud, chargebacks, payment reversals, account abuse, identity verification, suspicious transactions, policy violations, or legal/regulatory requirements.",
        "A Seller has no unconditional right to immediate payment merely because a Buyer has completed a Transaction.",
        "If a Transaction is later reversed, refunded, or charged back, SplitSubs may recover the corresponding amount from the Seller's available balance, future payouts, or other amounts owed to the Seller, to the extent permitted by law.",
      ]],
      ["14. Fees", [
        "SplitSubs may charge transaction fees, marketplace fees, service fees, subscription fees, payment-processing fees, Seller fees, withdrawal fees, currency-conversion fees, or other applicable charges. Applicable fees will be displayed before or during the relevant Transaction where reasonably practicable. Fees may be changed prospectively.",
      ]],
      ["15. Automatic Renewals", [
        "Some subscriptions may renew automatically. Where automatic renewal applies, the renewal period and price will be displayed before or during the relevant purchase.",
        "You are responsible for cancelling recurring Transactions before the applicable renewal date if you do not wish to continue. SplitSubs may provide reminders, but failure to receive a notification does not cancel a valid renewal.",
      ]],
      ["16. Refunds", [
        "Refund eligibility depends on the product, Listing, Transaction, and circumstances.",
        "A refund may be available where:",
        { type: "ul", items: [
          "the Seller fails to provide the advertised access;",
          "access is materially different from the Listing;",
          "the access is invalid at the time of delivery;",
          "a qualifying service becomes unavailable;",
          "SplitSubs determines a refund is appropriate; or",
          "applicable law requires a refund.",
        ]},
        "A refund may be denied where the Buyer violated these Terms, misused the product, shared credentials improperly, changed account credentials without authorisation, substantially used the service, experienced issues caused by their own device/network/location, failed to follow reasonable troubleshooting instructions, provided false information, initiated an illegitimate chargeback, or where the request is inconsistent with the applicable refund policy.",
        "Where appropriate, SplitSubs may provide a replacement, account credit, partial refund, or other remedy instead of a cash refund. Determinations are made based on the evidence reasonably available and subject to applicable law.",
      ]],
      ["17. Disputes Between Buyers and Sellers", [
        "SplitSubs may provide dispute-resolution assistance but is not necessarily a party to the underlying transaction between Buyer and Seller.",
        "Where a dispute arises, SplitSubs may request evidence (payment records, screenshots, messages, account information, delivery/access records, Listing information, technical logs, or other relevant material).",
        "SplitSubs may make a platform-level determination regarding refunds, replacements, account access, or Seller payouts. SplitSubs is not required to disclose confidential fraud-detection methods, internal risk models, or security information.",
      ]],
      ["18. Chargebacks and Payment Disputes", [
        "You agree to contact SplitSubs first regarding a Transaction dispute where reasonably possible. You must not initiate a fraudulent, misleading, or abusive chargeback.",
        "Examples of chargeback abuse include claiming a Transaction was unauthorised when it was authorised, falsely claiming non-receipt, seeking both a refund and chargeback for the same Transaction, providing false evidence, or initiating a chargeback solely to avoid payment for a service already received.",
        "Where a chargeback occurs, SplitSubs may suspend the account, restrict purchases, suspend Seller payouts, recover associated costs where permitted, provide evidence to the payment processor, and/or terminate the account.",
        "Nothing in this section limits any rights available to consumers under applicable law.",
      ]],
      ["19. Marketplace Circumvention", [
        "Users must not intentionally circumvent SplitSubs to avoid fees or Platform controls. You must not use information obtained through SplitSubs to move a Transaction off-platform, pay a Seller directly to avoid fees, arrange future Transactions outside SplitSubs for the purpose of avoiding fees, exchange payment details to circumvent the Platform, redirect another User to an external marketplace for a Transaction initiated through SplitSubs, or otherwise deliberately defeat SplitSubs' transaction system.",
        "SplitSubs may suspend or terminate accounts involved in circumvention and, where permitted by law, recover fees that would otherwise have been payable.",
      ]],
      ["20. Communications", [
        "Users may communicate through Platform messaging systems. You must not use Platform communications to harass, threaten, defraud, impersonate, distribute malware, solicit illegal activity, distribute prohibited content, collect unnecessary personal information, circumvent SplitSubs, or manipulate reviews or ratings.",
        "SplitSubs may review communications where reasonably necessary for security, fraud prevention, dispute resolution, legal compliance, or enforcement of these Terms, subject to applicable privacy law.",
      ]],
      ["21. Reviews and Ratings", [
        "Reviews must be truthful and based on genuine experiences. You must not submit fake reviews, purchase reviews, manipulate ratings, threaten another User to obtain a review, impersonate another customer, remove negative reviews through fraudulent means, or submit reviews containing unlawful or defamatory material.",
        "SplitSubs may remove reviews that violate its policies.",
      ]],
      ["22. Account Suspension and Termination", [
        "SplitSubs may suspend, restrict, or terminate an account where it reasonably believes a User has violated these Terms, engaged in fraud, created security risks, abused refunds or chargebacks, supplied false information, violated a Third-Party Service's rules, infringed intellectual-property rights, attempted to circumvent Platform fees, created financial or legal risk, engaged in unlawful activity, abused another User, manipulated the Platform, operated multiple prohibited accounts, or otherwise created a risk to SplitSubs or its community.",
        "These actions may be taken immediately where necessary to protect Users, the Platform, or third parties. Where appropriate, SplitSubs may provide notice or an opportunity to appeal.",
      ]],
      ["23. Effect of Termination", [
        "Upon termination:",
        { type: "ul", items: [
          "your right to access the Platform may cease;",
          "outstanding Transactions may be cancelled;",
          "access to certain digital products may be suspended;",
          "pending payouts may be held while legitimate disputes are resolved;",
          "credits may be subject to applicable refund rules; and",
          "provisions intended to survive termination will remain effective.",
        ]},
        "Termination does not eliminate obligations that arose before termination.",
      ]],
      ["24. Fraud Prevention and Verification", [
        "SplitSubs may use automated and manual systems to detect suspicious activity and may request identification documents, proof of payment, proof of subscription ownership, proof of address (where legally appropriate), business information, or other information reasonably required to verify an account or Transaction.",
        "SplitSubs may refuse, restrict, or delay Services where verification requirements are not satisfied and is not required to disclose internal fraud-detection thresholds, algorithms, or security procedures.",
      ]],
      ["25. Data Protection and Privacy", [
        "SplitSubs processes personal information in accordance with applicable data-protection laws and its Privacy Policy. Information processed may include name, email address, telephone number, account and transaction information, device information, IP address, technical data, customer-support communications, fraud-prevention information, and other data necessary to provide the Services.",
        "Processing purposes include account administration, payment processing, customer support, fraud prevention, security, dispute resolution, legal compliance, service improvement, analytics, and communications.",
        "SplitSubs may use third-party service providers for payment, hosting, analytics, communication, security, and other services. Your privacy rights are described in the applicable Privacy Policy.",
      ]],
      ["26. Intellectual Property", [
        "The SplitSubs Platform, including its software, design, branding, logos, text, graphics, interfaces, databases, and other materials, is owned by or licensed to SplitSubs unless otherwise stated.",
        "You may not copy the Platform, reproduce SplitSubs branding without permission, scrape the Platform, reverse-engineer the Platform, modify Platform software, create derivative works, use SplitSubs trademarks without authorisation, or commercially exploit Platform Content without permission.",
        "Third-party trademarks remain the property of their respective owners.",
      ]],
      ["27. User Content", [
        "You retain ownership of Content that you lawfully own and submit. By submitting Content, you grant SplitSubs a worldwide, non-exclusive, royalty-free licence to host, store, reproduce, display, modify (where necessary for technical purposes), distribute, and use that Content for operating, promoting, and improving the Platform.",
        "You represent that you have the necessary rights to provide such Content. SplitSubs may remove Content that violates these Terms or creates legal, security, or reputational risk.",
      ]],
      ["28. Third-Party Services and Links", [
        "The Platform may contain links to or integrations with third-party websites and services. SplitSubs does not control third-party services and is not responsible for their availability, content, security, privacy practices, pricing, policies, account restrictions, or changes made by those third parties.",
        "Your use of a Third-Party Service may be subject to separate terms imposed by that provider.",
      ]],
      ["29. Availability of the Platform", [
        "SplitSubs does not guarantee that the Platform will always be available, operate without interruption, be error-free, be free of vulnerabilities, or remain unchanged. Maintenance, technical failures, security incidents, third-party failures, and other events may temporarily affect the Platform.",
        "SplitSubs may modify, suspend, or discontinue any feature or Service at any time.",
      ]],
      ["30. Disclaimer of Warranties", [
        `To the maximum extent permitted by applicable law, the Platform and Services are provided on an "as available" and "as is" basis.`,
        "SplitSubs does not warrant that every Listing is suitable for you, every Seller will perform as expected, every subscription will remain available, third-party services will remain operational, the Platform will be uninterrupted, all information will always be accurate or complete, or that a particular product will meet your expectations.",
        "Nothing in these Terms excludes any warranty or consumer protection that cannot legally be excluded.",
      ]],
      ["31. Limitation of Liability", [
        "To the maximum extent permitted by applicable law, SplitSubs and its directors, officers, employees, contractors, affiliates, and service providers shall not be liable for indirect, consequential, or special losses; loss of profits, revenue, business, opportunity, or data; reputational damage; losses resulting from third-party services, Seller or Buyer misconduct, account termination resulting from policy violations, service interruptions beyond SplitSubs' reasonable control, or unauthorised actions of third parties.",
        "To the maximum extent permitted by law, SplitSubs' aggregate liability arising from a particular Transaction shall not exceed the amount actually paid by you to SplitSubs in connection with that Transaction.",
        "Nothing in these Terms limits liability that cannot legally be limited or excluded.",
      ]],
      ["32. Indemnification", [
        "To the maximum extent permitted by applicable law, you agree to indemnify and hold harmless SplitSubs, its affiliates, directors, officers, employees, contractors, and agents from claims, losses, liabilities, damages, costs, and expenses arising from your breach of these Terms, unlawful conduct, misuse of the Platform, Listing, violation of a third party's rights, intellectual-property infringement, fraud or misrepresentation, violation of another User's rights, or unauthorised use of a Third-Party Service.",
        "SplitSubs reserves the right to assume exclusive control of the defence of any claim for which it may be entitled to indemnification.",
      ]],
      ["33. Force Majeure", [
        "SplitSubs shall not be responsible for delays or failures caused by circumstances beyond its reasonable control, including internet outages, payment-provider or cloud-service failures, cyberattacks, government action, regulatory changes, strikes, natural disasters, war, civil unrest, telecommunications or power failures, Third-Party Service changes, or other events beyond reasonable control.",
      ]],
      ["34. Modifications to These Terms", [
        `SplitSubs may update these Terms from time to time. Updated Terms will be published on the Platform with a new "Last Updated" date. Where required by law, additional notice of material changes will be provided.`,
        "Your continued use of the Platform after updated Terms become effective constitutes acceptance of the updated Terms to the extent permitted by law.",
      ]],
      ["35. Changes to Services", [
        "SplitSubs may modify, add, suspend, or discontinue products, features, pricing, or Services. Where a material change affects an active paid service, SplitSubs may provide an appropriate remedy where required by applicable law or the applicable purchase terms.",
      ]],
      ["36. Notices", [
        "SplitSubs may communicate with you via email, SMS, WhatsApp or other supported messaging channels, Platform notifications, account notifications, or other contact information associated with your account. You are responsible for maintaining accurate contact information.",
      ]],
      ["37. Electronic Communications", [
        "You agree that electronic communications may satisfy legal requirements for written communications where permitted by applicable law. You consent to receive transactional communications electronically. Marketing communications are subject to separate consent and opt-out mechanisms.",
      ]],
      ["38. Assignment", [
        "You may not transfer or assign your rights or obligations under these Terms without SplitSubs' prior written consent. SplitSubs may assign or transfer its rights and obligations in connection with a merger, acquisition, restructuring, sale of assets, financing, corporate reorganisation, or similar transaction.",
      ]],
      ["39. Severability", [
        "If any provision of these Terms is determined to be invalid or unenforceable, the remaining provisions will continue in effect. The invalid provision will be interpreted or modified to the extent necessary to make it enforceable while preserving its intended purpose, where legally permitted.",
      ]],
      ["40. No Waiver", [
        "Failure by SplitSubs to enforce any provision of these Terms does not constitute a waiver of its right to enforce that provision later.",
      ]],
      ["41. Entire Agreement", [
        "These Terms, together with the Privacy Policy, Refund Policy, Seller Policy, and any other policies expressly incorporated into them, constitute the entire agreement between you and SplitSubs regarding your use of the Platform.",
      ]],
      ["42. Governing Law", [
        "These Terms shall be governed by the laws of Kenya, except to the extent that mandatory laws applicable to a consumer require otherwise.",
        "Where legally permitted, disputes shall be subject to the jurisdiction of the courts of Kenya. Nothing in this clause removes any mandatory consumer rights or remedies that cannot legally be excluded.",
      ]],
      ["43. Dispute Resolution", [
        "Before commencing formal legal proceedings, Users are encouraged to contact SplitSubs and attempt to resolve the dispute through the Platform's customer-support and dispute-resolution process. Where appropriate, SplitSubs may require Users to participate in a reasonable internal dispute-resolution process before escalation, subject to applicable law.",
        "Nothing in this provision prevents a User from exercising a mandatory statutory right.",
      ]],
      ["44. Compliance with Law", [
        "You agree to comply with all laws and regulations applicable to your use of the Platform. SplitSubs may cooperate with lawful requests from courts, regulators, law-enforcement agencies, payment providers, and other authorised bodies.",
      ]],
      ["45. Reporting Abuse and Fraud", [
        "Users may report fraudulent Listings, stolen accounts, compromised credentials, scams, unauthorised transactions, harassment, intellectual-property violations, security vulnerabilities, or other prohibited activity. SplitSubs may investigate reports and take any action it reasonably considers appropriate.",
      ]],
      ["46. No Employment, Agency or Partnership", [
        "Use of the Platform does not create an employment relationship, partnership, joint venture, or agency relationship between SplitSubs and a User. A Seller is not automatically an employee, agent, or representative of SplitSubs. A User may not represent that they have authority to act on behalf of SplitSubs unless expressly authorised.",
      ]],
      ["47. Platform Security", [
        "You must not attempt unauthorised access, interfere with Platform infrastructure, conduct denial-of-service attacks, introduce malicious code, scrape the Platform in violation of applicable rules, bypass security mechanisms, probe vulnerabilities without authorisation, or interfere with another User's account.",
        "Security vulnerabilities should be responsibly reported to SplitSubs.",
      ]],
      ["48. Business Users", [
        "If you use SplitSubs on behalf of a business or organisation, you represent that you have authority to bind that organisation to these Terms. The organisation is responsible for the actions of its authorised Users.",
      ]],
      ["49. Special Terms for Sellers", [
        "SplitSubs may establish additional Seller requirements, including identity or business verification, proof of ownership, minimum performance standards, response-time requirements, refund obligations, reserve requirements, payout schedules, transaction limits, Seller ratings, minimum account age, and additional security controls.",
        "These requirements may be communicated through the Platform and form part of the agreement between SplitSubs and the Seller.",
      ]],
      ["50. Special Terms for High-Risk Transactions", [
        "SplitSubs may classify certain Transactions as higher risk based on factors including Transaction value, account history, payment method, geographical location, unusual activity, chargeback history, Seller history, product category, or fraud indicators.",
        "Enhanced verification, transaction limits, payout holds, or other safeguards may be applied to such Transactions.",
      ]],
      ["51. Acceptable Use", [
        "You agree to use SplitSubs honestly, lawfully, and responsibly. You must not use SplitSubs to facilitate fraud, money laundering, identity theft, unauthorised access, intellectual-property infringement, payment abuse, cybercrime, harassment, impersonation, manipulation of Platform systems, circumvention of restrictions, or any activity that may expose SplitSubs or other Users to unreasonable risk.",
      ]],
      ["52. Survival", [
        "Sections concerning intellectual property, payments, outstanding obligations, indemnification, limitations of liability, dispute resolution, governing law, confidentiality, fraud, and other provisions that by their nature should survive termination shall survive termination of these Terms.",
      ]],
      ["53. Contact", [
        "Questions concerning these Terms may be directed to SplitSubs through the official customer-support channels made available on the Platform. The current contact information published on the SplitSubs Platform shall be treated as the official contact information for these purposes.",
      ]],
      ["54. Acceptance", [
        `By clicking "I Agree", creating an account, making a purchase, creating a Listing, continuing to use the Platform, or otherwise accessing SplitSubs, you acknowledge that:`,
        { type: "ol", items: [
          "you have read these Terms;",
          "you understand these Terms;",
          "you agree to be bound by these Terms; and",
          "you have had an opportunity to review the applicable policies before using the relevant Services.",
        ]},
      ]],
    ],
    outro: "END OF TERMS AND CONDITIONS",
  },
  privacy: {
    title: "Privacy Policy",
    metaDesc: "SplitSubs Privacy Policy — what information we collect, how it's used, and who we share it with.",
    sections: [
      ["1. Information We Collect", [
        "Account details you provide (name, email, phone number), payment metadata from Paystack (not your full card or M-Pesa PIN), group membership and payment history, and support messages you send us.",
      ]],
      ["2. How We Use Your Information", [
        "To operate your account, process payments, send transactional emails (receipts, renewal reminders, OTPs) via Resend, prevent fraud, and — if you opt in — send newsletter updates.",
      ]],
      ["3. Who We Share It With", [
        "Paystack (payment processing), Resend (transactional email delivery), and group moderators (limited to what's needed to run the group you've joined, such as your masked email and payment status). We do not sell your personal information.",
      ]],
      ["4. Cookies & Local Storage", [
        "SplitSubs uses local browser storage to keep you signed in and to remember basic preferences. We don't use third-party advertising trackers.",
      ]],
      ["5. Data Retention", [
        "We retain account and payment records for as long as your account is active and as needed to meet accounting, tax, and legal obligations afterward.",
      ]],
      ["6. Your Rights", [
        "You can request a copy of your data, ask us to correct inaccurate information, or request account deletion by emailing admin@splitsubs.com. Some records (e.g. payment history) may need to be retained for legal/accounting reasons even after deletion.",
      ]],
      ["7. Contact", [
        "Privacy questions can be sent to admin@splitsubs.com.",
      ]],
    ],
  },
  refund: {
    title: "Refund Policy",
    metaDesc: "SplitSubs Refund Policy — when a payment for a group slot is and isn't eligible for a refund.",
    sections: [
      ["1. General Policy", [
        "Because a group slot grants you immediate access to shared subscription details once payment is confirmed, payments are generally non-refundable once your slot has been confirmed and access has been provided.",
      ]],
      ["2. When a Refund May Apply", [
        "You may be eligible for a refund or credit if: the group's moderator fails to deliver working access after payment is confirmed, the underlying subscription is cancelled or becomes unavailable through no fault of yours, or you were charged in error (e.g. a duplicate payment).",
      ]],
      ["3. How to Request", [
        "Contact admin@splitsubs.com within 7 days of the issue with your group name, payment reference, and a description of the problem. We'll review the group's payment log and access history before deciding.",
      ]],
      ["4. Processing Time", [
        "Approved refunds are processed back to your original payment method via Paystack, typically within 5–10 business days depending on your bank or mobile money provider.",
      ]],
      ["5. Platform Fees", [
        "The platform fee portion of your payment is non-refundable except where the refund is due to a SplitSubs platform error.",
      ]],
    ],
  },
  "data-protection": {
    title: "Data Protection Policy",
    metaDesc: "SplitSubs Data Protection Policy — our approach to safeguarding your personal data.",
    sections: [
      ["1. Our Approach", [
        "SplitSubs collects the minimum personal data needed to run group-buy subscriptions and process payments, and aims to handle it in line with the principles of Kenya's Data Protection Act, 2019 and comparable data protection regulations.",
      ]],
      ["2. Security Measures", [
        "Passwords are stored hashed, never in plain text. Payment card and mobile money details are handled entirely by Paystack — SplitSubs' servers never store your full card number or M-Pesa PIN. Access to admin tools is role-gated and requires authentication.",
      ]],
      ["3. Data Minimization", [
        "Group moderators only see what's necessary to run their group (e.g. a masked email and payment status) — not your full account details.",
      ]],
      ["4. Data Subject Rights", [
        "You may request access to, correction of, or deletion of your personal data by emailing admin@splitsubs.com. We'll respond within a reasonable timeframe and explain any legal reasons we may need to retain specific records.",
      ]],
      ["5. Breach Notification", [
        "In the event of a data breach affecting your personal information, we will notify affected users and relevant authorities as required by applicable law.",
      ]],
      ["6. Contact", [
        "For data protection questions or to exercise your rights, email admin@splitsubs.com.",
      ]],
    ],
  },
};

function renderBlock(block, key) {
  if (typeof block === "string") {
    return <p key={key} style={{ fontSize: "0.88rem", color: "var(--muted)", lineHeight: 1.65, margin: "0 0 10px 0" }}>{block}</p>;
  }
  if (block.type === "ul") {
    return (
      <ul key={key} style={{ fontSize: "0.88rem", color: "var(--muted)", lineHeight: 1.65, margin: "0 0 10px 0", paddingLeft: 20 }}>
        {block.items.map((it, i) => <li key={i} style={{ marginBottom: 4 }}>{it}</li>)}
      </ul>
    );
  }
  if (block.type === "ol") {
    return (
      <ol key={key} style={{ fontSize: "0.88rem", color: "var(--muted)", lineHeight: 1.65, margin: "0 0 10px 0", paddingLeft: 20 }}>
        {block.items.map((it, i) => <li key={i} style={{ marginBottom: 4 }}>{it}</li>)}
      </ol>
    );
  }
  return null;
}

export default function LegalPage({ type, navigate }) {
  const doc = CONTENT[type] || CONTENT.terms;

  useEffect(() => {
    document.title = `${doc.title} — SplitSubs`;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", doc.metaDesc);
  }, [type, doc.title, doc.metaDesc]);

  return (
    <div className="fade-in" style={{ maxWidth: 760, margin: "0 auto", padding: "20px 4px 60px" }}>
      <button className="btn btn-outline btn-sm" onClick={() => navigate("home")} style={{ marginBottom: 20 }}>
        ← Back to Home
      </button>

      <h1 className="page-title" style={{ marginBottom: 4 }}>{doc.title}</h1>
      <p style={{ color: "var(--muted)", fontSize: "0.82rem", marginBottom: 24 }}>Last updated: {doc.lastUpdated || LAST_UPDATED}</p>

      <div style={{
        background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)",
        borderRadius: 10, padding: "12px 16px", marginBottom: 28, fontSize: "0.8rem", color: "var(--text)", lineHeight: 1.5,
      }}>
        ⚠️ This is a starting draft describing how SplitSubs actually operates today. It hasn't been reviewed by a lawyer —
        please have it checked against your local regulations before treating it as your final, binding policy.
      </div>

      {doc.intro && (
        <div style={{ marginBottom: 22 }}>
          {doc.intro.map((p, i) => (
            <p key={i} style={{ fontSize: "0.88rem", color: "var(--muted)", lineHeight: 1.65, margin: "0 0 10px 0" }}>{p}</p>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {doc.sections.map(([heading, body]) => (
          <div key={heading}>
            <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 6, color: "var(--text)" }}>{heading}</h2>
            {Array.isArray(body)
              ? body.map((block, i) => renderBlock(block, i))
              : <p style={{ fontSize: "0.88rem", color: "var(--muted)", lineHeight: 1.65, margin: 0 }}>{body}</p>}
          </div>
        ))}
      </div>

      {doc.outro && (
        <p style={{ marginTop: 28, fontSize: "0.78rem", color: "var(--muted)", opacity: 0.7, textAlign: "center", letterSpacing: "0.04em" }}>
          {doc.outro}
        </p>
      )}
    </div>
  );
}
