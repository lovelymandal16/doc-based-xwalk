import { createOptimizedPicture } from '../../scripts/aem.js';
import transferRepeatableDOM, { insertAddButton, insertRemoveButton } from './components/repeat/repeat.js';
import { emailPattern, getSubmitBaseUrl, SUBMISSION_SERVICE } from './constant.js';
import GoogleReCaptcha from './integrations/recaptcha.js';
import componentDecorator from './mappings.js';
import { handleSubmit } from './submit.js';
import DocBasedFormToAF from './transform.js';
import {
  checkValidation,
  createButton,
  createDropdownUsingEnum,
  createFieldWrapper,
  createHelpText,
  createLabel,
  createRadioOrCheckboxUsingEnum,
  extractIdFromUrl,
  getHTMLRenderType,
  getSitePageName,
  setConstraints,
  setPlaceholder,
  stripTags,
  createRadioOrCheckbox,
  createInput,
} from './util.js';

export const DELAY_MS = 0;
let captchaField;
let afModule;

const withFieldWrapper = (element) => (fd) => {
  const wrapper = createFieldWrapper(fd);
  wrapper.append(element(fd));
  return wrapper;
};

const createTextArea = withFieldWrapper((fd) => {
  const input = document.createElement('textarea');
  setPlaceholder(input, fd);
  return input;
});

const createSelect = withFieldWrapper((fd) => {
  const select = document.createElement('select');
  createDropdownUsingEnum(fd, select);
  return select;
});

function createHeading(fd) {
  const wrapper = createFieldWrapper(fd);
  const heading = document.createElement('h2');
  heading.textContent = fd.value || fd.label.value;
  heading.id = fd.id;
  wrapper.append(heading);

  return wrapper;
}

function createLegend(fd) {
  return createLabel(fd, 'legend');
}

function createRepeatablePanel(wrapper, fd) {
  setConstraints(wrapper, fd);
  wrapper.dataset.repeatable = true;
  wrapper.dataset.index = fd.index || 0;
  if (fd.properties) {
    Object.keys(fd.properties).forEach((key) => {
      if (!key.startsWith('fd:')) {
        wrapper.dataset[key] = fd.properties[key];
      }
    });
  }
  if ((!fd.index || fd?.index === 0) && fd.properties?.variant !== 'noButtons') {
    insertAddButton(wrapper, wrapper);
    insertRemoveButton(wrapper, wrapper);
  }
}

function createFieldSet(fd) {
  const wrapper = createFieldWrapper(fd, 'fieldset', createLegend);
  wrapper.id = fd.id;
  wrapper.name = fd.name;
  if (fd.fieldType === 'panel') {
    wrapper.classList.add('panel-wrapper');
  }
  if (fd.repeatable === true) {
    createRepeatablePanel(wrapper, fd);
  }
  return wrapper;
}

function setConstraintsMessage(field, messages = {}) {
  Object.keys(messages).forEach((key) => {
    field.dataset[`${key}ErrorMessage`] = messages[key];
  });
}

function createRadioOrCheckboxGroup(fd) {
  const wrapper = createFieldSet({ ...fd });
  createRadioOrCheckboxUsingEnum(fd, wrapper);
  wrapper.dataset.required = fd.required;
  if (fd.tooltip) {
    wrapper.title = stripTags(fd.tooltip, '');
  }
  setConstraintsMessage(wrapper, fd.constraintMessages);
  return wrapper;
}

function createPlainText(fd) {
  const paragraph = document.createElement('p');
  if (fd.richText) {
    paragraph.innerHTML = stripTags(fd.value);
  } else {
    paragraph.textContent = fd.value;
  }
  const wrapper = createFieldWrapper(fd);
  wrapper.id = fd.id;
  wrapper.replaceChildren(paragraph);
  return wrapper;
}

function createImage(fd) {
  const field = createFieldWrapper(fd);
  field.id = fd?.id;
  const imagePath = fd.value || fd.properties['fd:repoPath'] || '';
  const altText = fd.altText || fd.name;
  field.append(createOptimizedPicture(imagePath, altText));
  return field;
}

const fieldRenderers = {
  'drop-down': createSelect,
  'plain-text': createPlainText,
  checkbox: createRadioOrCheckbox,
  button: createButton,
  multiline: createTextArea,
  panel: createFieldSet,
  radio: createRadioOrCheckbox,
  'radio-group': createRadioOrCheckboxGroup,
  'checkbox-group': createRadioOrCheckboxGroup,
  image: createImage,
  heading: createHeading,
};

function colSpanDecorator(field, element) {
  const colSpan = field['Column Span'] || field.properties?.colspan;
  if (colSpan && element) {
    element.classList.add(`col-${colSpan}`);
  }
}

const handleFocus = (input, field) => {
  const editValue = input.getAttribute('edit-value');
  input.type = field.type;
  input.value = editValue;
};

const handleFocusOut = (input) => {
  const displayValue = input.getAttribute('display-value');
  input.type = 'text';
  input.value = displayValue;
};

function inputDecorator(field, element) {
  const input = element?.querySelector('input,textarea,select');
  if (input) {
    input.id = field.id;
    input.name = field.name;
    if (field.tooltip) {
      input.title = stripTags(field.tooltip, '');
    }
    input.readOnly = field.readOnly;
    input.autocomplete = field.autoComplete ?? 'off';
    input.disabled = field.enabled === false;
    if (field.fieldType === 'drop-down' && field.readOnly) {
      input.disabled = true;
    }
    const fieldType = getHTMLRenderType(field);
    if (['number', 'date', 'text', 'email'].includes(fieldType) && (field.displayFormat || field.displayValueExpression)) {
      field.type = fieldType;
      input.setAttribute('edit-value', field.value ?? '');
      input.setAttribute('display-value', field.displayValue ?? '');
      input.type = 'text';
      input.value = field.displayValue ?? '';
      input.addEventListener('touchstart', () => { input.type = field.type; }); // in mobile devices the input type needs to be toggled before focus
      input.addEventListener('focus', () => handleFocus(input, field));
      input.addEventListener('blur', () => handleFocusOut(input));
    } else if (input.type !== 'file') {
      input.value = field.value ?? '';
      if (input.type === 'radio' || input.type === 'checkbox') {
        input.value = field?.enum?.[0] ?? 'on';
        input.checked = field.value === input.value;
      }
    } else {
      input.multiple = field.type === 'file[]';
    }
    if (field.required) {
      input.setAttribute('required', 'required');
    }
    if (field.description) {
      input.setAttribute('aria-describedby', `${field.id}-description`);
    }
    if (field.minItems) {
      input.dataset.minItems = field.minItems;
    }
    if (field.maxItems) {
      input.dataset.maxItems = field.maxItems;
    }
    if (field.maxFileSize) {
      input.dataset.maxFileSize = field.maxFileSize;
    }
    if (field.default !== undefined) {
      input.setAttribute('value', field.default);
    }
    if (input.type === 'email') {
      input.pattern = emailPattern;
    }
    setConstraintsMessage(element, field.constraintMessages);
    element.dataset.required = field.required;
  }
}

function decoratePanelContainer(panelDefinition, panelContainer) {
  if (!panelContainer) return;

  const isPanelWrapper = (container) => container.classList?.contains('panel-wrapper');

  const shouldAddLabel = (container, panel) => panel.label && !container.querySelector(`legend[for=${container.dataset.id}]`);

  const isContainerRepeatable = (container) => container.dataset?.repeatable === 'true' && container.dataset?.variant !== 'noButtons';

  const needsAddButton = (container) => !container.querySelector(':scope > .repeat-actions');

  const needsRemoveButton = (container) => !container.querySelector(':scope > .item-remove');

  if (isPanelWrapper(panelContainer)) {
    if (shouldAddLabel(panelContainer, panelDefinition)) {
      const legend = createLegend(panelDefinition);
      if (legend) {
        panelContainer.insertAdjacentElement('afterbegin', legend);
      }
    }

    if (isContainerRepeatable(panelContainer)) {
      if (needsAddButton(panelContainer)) {
        insertAddButton(panelContainer, panelContainer);
      }
      if (needsRemoveButton(panelContainer)) {
        insertRemoveButton(panelContainer, panelContainer);
      }
    }
  }
}

function renderField(fd) {
  const fieldType = fd?.fieldType?.replace('-input', '') ?? 'text';
  const renderer = fieldRenderers[fieldType];
  let field;
  if (typeof renderer === 'function') {
    field = renderer(fd);
  } else {
    field = createFieldWrapper(fd);
    field.append(createInput(fd));
  }
  if (fd.description) {
    field.append(createHelpText(fd));
    field.dataset.description = fd.description; // In case overriden by error message
  }
  if (fd.fieldType !== 'radio-group' && fd.fieldType !== 'checkbox-group' && fd.fieldType !== 'captcha') {
    inputDecorator(fd, field);
  }
  return field;
}

export async function generateFormRendition(panel, container, formId, getItems = (p) => p?.items) {
  const items = getItems(panel) || [];
  const promises = items.map(async (field) => {
    field.value = field.value ?? '';
    const { fieldType } = field;
    if (fieldType === 'captcha') {
      captchaField = field;
      const element = createFieldWrapper(field);
      element.textContent = 'CAPTCHA';
      return element;
    }
    const element = renderField(field);
    if (field.appliedCssClassNames) {
      element.className += ` ${field.appliedCssClassNames}`;
    }
    colSpanDecorator(field, element);
    if (field?.fieldType === 'panel') {
      await generateFormRendition(field, element, formId, getItems);
      return element;
    }
    await componentDecorator(element, field, container, formId);
    return element;
  });

  const children = await Promise.all(promises);
  container.append(...children.filter((_) => _ != null));
  decoratePanelContainer(panel, container);
  await componentDecorator(container, panel, null, formId);
}

function enableValidation(form) {
  form.querySelectorAll('input,textarea,select').forEach((input) => {
    input.addEventListener('invalid', (event) => {
      checkValidation(event.target);
    });
  });

  form.addEventListener('change', (event) => {
    checkValidation(event.target);
  });
}

async function createFormForAuthoring(formDef) {
  const form = document.createElement('form');
  await generateFormRendition(formDef, form, formDef.id, (container) => {
    if (container[':itemsOrder'] && container[':items']) {
      return container[':itemsOrder'].map((itemKey) => container[':items'][itemKey]);
    }
    return [];
  });
  return form;
}

export async function createForm(formDef, data) {
  const { action: formPath } = formDef;
  const form = document.createElement('form');
  form.dataset.action = formPath;
  form.noValidate = true;
  if (formDef.appliedCssClassNames) {
    form.className = formDef.appliedCssClassNames;
  }
  const formId = extractIdFromUrl(formPath); // formDef.id returns $form after getState()
  await generateFormRendition(formDef, form, formId);

  let captcha;
  if (captchaField) {
    let config = captchaField?.properties?.['fd:captcha']?.config;
    if (!config) {
      config = {
        siteKey: captchaField?.value,
        uri: captchaField?.uri,
        version: captchaField?.version,
      };
    }
    const pageName = getSitePageName(captchaField?.properties?.['fd:path']);
    captcha = new GoogleReCaptcha(config, captchaField.id, captchaField.name, pageName);
    captcha.loadCaptcha(form);
  }

  enableValidation(form);
  transferRepeatableDOM(form);

  if (afModule) {
    window.setTimeout(async () => {
      afModule.loadRuleEngine(formDef, form, captcha, generateFormRendition, data);
    }, DELAY_MS);
  }

  form.addEventListener('reset', async () => {
    const newForm = await createForm(formDef);
    document.querySelector(`[data-action="${form?.dataset?.action}"]`)?.replaceWith(newForm);
  });

  form.addEventListener('submit', (e) => {
    handleSubmit(e, form, captcha);
  });

  return form;
}

function isDocumentBasedForm(formDef) {
  return formDef?.[':type'] === 'sheet' && formDef?.data;
}

function cleanUp(content) {
  const formDef = content.replaceAll('^(([^<>()\\\\[\\\\]\\\\\\\\.,;:\\\\s@\\"]+(\\\\.[^<>()\\\\[\\\\]\\\\\\\\.,;:\\\\s@\\"]+)*)|(\\".+\\"))@((\\\\[[0-9]{1,3}\\\\.[0-9]{1,3}\\\\.[0-9]{1,3}\\\\.[0-9]{1,3}])|(([a-zA-Z\\\\-0-9]+\\\\.)\\+[a-zA-Z]{2,}))$', '');
  return formDef?.replace(/\x83\n|\n|\s\s+/g, '');
}
/*
  Newer Clean up - Replace backslashes that are not followed by valid json escape characters
  function cleanUp(content) {
    return content.replace(/\\/g, (match, offset, string) => {
      const prevChar = string[offset - 1];
      const nextChar = string[offset + 1];
      const validEscapeChars = ['b', 'f', 'n', 'r', 't', '"', '\\'];
      if (validEscapeChars.includes(nextChar) || prevChar === '\\') {
        return match;
      }
      return '';
    });
  }
*/

function decode(rawContent) {
  const content = rawContent.trim();
  if (content.startsWith('"') && content.endsWith('"')) {
    // In the new 'jsonString' context, Server side code comes as a string with escaped characters,
    // hence the double parse
    return JSON.parse(JSON.parse(content));
  }
  return JSON.parse(cleanUp(content));
}

async function createMasterXDP() {
  try {
    const response = await fetch('http://localhost:4502/adobe/communications/crisprtoxdp', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic YWRtaW46YWRtaW4=',
        'Content-Type': 'application/json',
        'User-Agent': 'insomnia/10.1.1-adobe'
      },
      body: JSON.stringify({
        "id": "L2NvbnRlbnQvZm9ybXMvYWYvdjJmb3Jtb3JpZw==",
        "fieldType": "form",
        "lang": "en",
        "title": "v2formorig",
        "action": "/adobe/forms/af/submit/L2NvbnRlbnQvZm9ybXMvYWYvdjJmb3Jtb3JpZw==",
        "properties": {
          "fd:changeEventBehaviour": "deps",
          "themeRef": "/libs/fd/af/themes/canvas",
          "fd:dor": {
            "dorType": "none",
            "pageTemplate": {
              ":type": "core/fd/components/form/pageTemplate/v2/pageTemplate",
              "template": {
                ":type": "core/fd/components/form/template/v1/template",
                ":items": {
                  "panel": {
                    "fieldType": "panel",
                    "name": "form1",
                    "properties": {
                      "fd:dor": {
                        "dorContainer": {
                          "type": "subform",
                          "locale": "en_US",
                          "layout": "tb",
                          "desc": {
                            "text": {
                              "content": "2023.07.17.1."
                            }
                          }
                        }
                      }
                    },
                    ":items": {
                      "pageset": {
                        "fieldType": "pageset",
                        "properties": {
                          "fd:dor": {
                            "dorContainer": {
                              "type": "pageset"
                            }
                          }
                        },
                        ":itemsOrder": [
                          "Page1"
                        ],
                        ":items": {
                          "Page1": {
                            "fieldType": "pagearea",
                            "properties": {
                              "fd:dor": {
                                "dorContainer": {
                                  "type": "pagearea"
                                }
                              }
                            },
                            "name": "Page1",
                            "id": "Page1",
                            ":items": {
                              "medium": {
                                "fieldType": "medium",
                                "properties": {
                                  "fd:dor": {
                                    "dorContainer": {
                                      "type": "medium",
                                      "stock": "default",
                                      "short": "215.9mm",
                                      "long": "279.4mm"
                                    }
                                  }
                                }
                              },
                              "contentarea": {
                                "fieldType": "contentarea",
                                "properties": {
                                  "fd:dor": {
                                    "dorContainer": {
                                      "type": "contentarea",
                                      "width": "203.2mm",
                                      "height": "266.7mm",
                                      "left": "6.35mm",
                                      "top": "6.35mm"
                                    }
                                  }
                                }
                              }
                            },
                            ":itemsOrder": [
                              "medium",
                              "contentarea"
                            ]
                          }
                        }
                      }
                    },
                    ":itemsOrder": [
                      "pageset"
                    ]
                  }
                },
                ":itemsOrder": [
                  "panel"
                ]
              },
              "config": "<config xmlns=\"http://www.xfa.org/schema/xci/3.0/\">\n   <agent name=\"designer\">\n      <!--  [0..n]  -->\n      <destination>pdf</destination>\n      <pdf>\n         <!--  [0..n]  -->\n         <fontInfo></fontInfo>\n      </pdf>\n   </agent>\n   <present>\n      <!--  [0..n]  -->\n      <pdf>\n         <!--  [0..n]  -->\n         <fontInfo>\n            <embed>0</embed>\n         </fontInfo>\n         <tagged>0</tagged>\n         <version>1.7</version>\n         <adobeExtensionLevel>11</adobeExtensionLevel>\n      </pdf>\n      <xdp>\n         <packets>*</packets>\n      </xdp>\n   </present>\n</config>",
              "localeSet": "<localeSet xmlns=\"http://www.xfa.org/schema/xfa-locale-set/2.7/\">\n   <locale name=\"en_US\" desc=\"English (United States)\">\n      <calendarSymbols name=\"gregorian\">\n         <monthNames>\n            <month>January</month>\n            <month>February</month>\n            <month>March</month>\n            <month>April</month>\n            <month>May</month>\n            <month>June</month>\n            <month>July</month>\n            <month>August</month>\n            <month>September</month>\n            <month>October</month>\n            <month>November</month>\n            <month>December</month>\n         </monthNames>\n         <monthNames abbr=\"1\">\n            <month>Jan</month>\n            <month>Feb</month>\n            <month>Mar</month>\n            <month>Apr</month>\n            <month>May</month>\n            <month>Jun</month>\n            <month>Jul</month>\n            <month>Aug</month>\n            <month>Sep</month>\n            <month>Oct</month>\n            <month>Nov</month>\n            <month>Dec</month>\n         </monthNames>\n         <dayNames>\n            <day>Sunday</day>\n            <day>Monday</day>\n            <day>Tuesday</day>\n            <day>Wednesday</day>\n            <day>Thursday</day>\n            <day>Friday</day>\n            <day>Saturday</day>\n         </dayNames>\n         <dayNames abbr=\"1\">\n            <day>Sun</day>\n            <day>Mon</day>\n            <day>Tue</day>\n            <day>Wed</day>\n            <day>Thu</day>\n            <day>Fri</day>\n            <day>Sat</day>\n         </dayNames>\n         <meridiemNames>\n            <meridiem>AM</meridiem>\n            <meridiem>PM</meridiem>\n         </meridiemNames>\n         <eraNames>\n            <era>BC</era>\n            <era>AD</era>\n         </eraNames>\n      </calendarSymbols>\n      <datePatterns>\n         <datePattern name=\"full\">EEEE, MMMM D, YYYY</datePattern>\n         <datePattern name=\"long\">MMMM D, YYYY</datePattern>\n         <datePattern name=\"med\">MMM D, YYYY</datePattern>\n         <datePattern name=\"short\">M/D/YY</datePattern>\n      </datePatterns>\n      <timePatterns>\n         <timePattern name=\"full\">h:MM:SS A Z</timePattern>\n         <timePattern name=\"long\">h:MM:SS A Z</timePattern>\n         <timePattern name=\"med\">h:MM:SS A</timePattern>\n         <timePattern name=\"short\">h:MM A</timePattern>\n      </timePatterns>\n      <dateTimeSymbols>GyMdkHmsSEDFwWahKzZ</dateTimeSymbols>\n      <numberPatterns>\n         <numberPattern name=\"numeric\">z,zz9.zzz</numberPattern>\n         <numberPattern name=\"currency\">$z,zz9.99|($z,zz9.99)</numberPattern>\n         <numberPattern name=\"percent\">z,zz9%</numberPattern>\n      </numberPatterns>\n      <numberSymbols>\n         <numberSymbol name=\"decimal\">.</numberSymbol>\n         <numberSymbol name=\"grouping\">,</numberSymbol>\n         <numberSymbol name=\"percent\">%</numberSymbol>\n         <numberSymbol name=\"minus\">-</numberSymbol>\n         <numberSymbol name=\"zero\">0</numberSymbol>\n      </numberSymbols>\n      <currencySymbols>\n         <currencySymbol name=\"symbol\">$</currencySymbol>\n         <currencySymbol name=\"isoname\">USD</currencySymbol>\n         <currencySymbol name=\"decimal\">.</currencySymbol>\n      </currencySymbols>\n      <typefaces>\n         <typeface name=\"Myriad Pro\"></typeface>\n         <typeface name=\"Minion Pro\"></typeface>\n         <typeface name=\"Courier Std\"></typeface>\n         <typeface name=\"Adobe Pi Std\"></typeface>\n         <typeface name=\"Adobe Hebrew\"></typeface>\n         <typeface name=\"Adobe Arabic\"></typeface>\n         <typeface name=\"Adobe Thai\"></typeface>\n         <typeface name=\"Kozuka Gothic Pro-VI M\"></typeface>\n         <typeface name=\"Kozuka Mincho Pro-VI R\"></typeface>\n         <typeface name=\"Adobe Ming Std L\"></typeface>\n         <typeface name=\"Adobe Song Std L\"></typeface>\n         <typeface name=\"Adobe Myungjo Std M\"></typeface>\n         <typeface name=\"Adobe Devanagari\"></typeface>\n      </typefaces>\n   </locale>\n</localeSet>",
              "xmpMetaData": "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\" x:xmptk=\"Adobe XMP Core 9.0-c000 79.cca54b0, 2022/11/26-09:29:55        \">\n   <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n      <rdf:Description xmlns:xmp=\"http://ns.adobe.com/xap/1.0/\" xmlns:pdfuaid=\"http://www.aiim.org/pdfua/ns/id/\" xmlns:pdf=\"http://ns.adobe.com/pdf/1.3/\" xmlns:xmpMM=\"http://ns.adobe.com/xap/1.0/mm/\" xmlns:desc=\"http://ns.adobe.com/xfa/promoted-desc/\" rdf:about=\"\">\n         <xmp:MetadataDate>2024-05-20T09:32:29Z</xmp:MetadataDate>\n         <xmp:CreatorTool>Designer 2023.07</xmp:CreatorTool>\n         <pdfuaid:part>1</pdfuaid:part>\n         <pdf:Producer>Designer 2023.07</pdf:Producer>\n         <xmpMM:DocumentID>uuid:36f0018a-338d-4185-9f48-13eb5d7236fb</xmpMM:DocumentID>\n         <desc:version rdf:parseType=\"Resource\">\n            <rdf:value>2023.07.17.1.</rdf:value>\n            <desc:ref>/template/subform[1]</desc:ref>\n         </desc:version>\n      </rdf:Description>\n   </rdf:RDF>\n</x:xmpmeta>"
            }
          },
          "fd:path": "/content/forms/af/v2formorig/jcr:content/guideContainer",
          "fd:schemaType": "BASIC",
          "fd:isHamburgerMenuEnabled": false,
          "fd:roleAttribute": null,
          "fd:formDataEnabled": false,
          "fd:customFunctionsUrl": "/adobe/forms/af/customfunctions/L2NvbnRlbnQvZm9ybXMvYWYvdjJmb3Jtb3JpZw==",
          "fd:dataUrl": "/adobe/forms/af/data/L2NvbnRlbnQvZm9ybXMvYWYvdjJmb3Jtb3JpZw=="
        },
        "columnCount": 12,
        "columnClassNames": {
          "text": "aem-GridColumn aem-GridColumn--default--12",
          "textinput": "aem-GridColumn aem-GridColumn--default--12"
        },
        "gridClassNames": "aem-Grid aem-Grid--12 aem-Grid--default--12",
        "events": {
          "custom:setProperty": [
            "$event.payload"
          ]
        },
        ":itemsOrder": [
          "text",
          "textinput"
        ],
        "adaptiveform": "0.14.2",
        "metadata": {
          "grammar": "json-formula-1.0.0",
          "version": "1.0.0"
        },
        ":type": "forms-components-examples/components/form/container",
        ":items": {
          "text": {
            "id": "text-66a51cb1bd",
            "fieldType": "plain-text",
            "name": "text1747655022767",
            "value": "<p>Hello Dhruv</p>",
            "richText": true,
            "events": {
              "custom:setProperty": [
                "$event.payload"
              ]
            },
            "properties": {
              "fd:dor": {
                "dorExclusion": false
              },
              "fd:path": "/content/forms/af/v2formorig/jcr:content/guideContainer/text"
            },
            ":type": "forms-components-examples/components/form/text"
          },
          "textinput": {
            "id": "textinput-1d1c218acd",
            "fieldType": "text-input",
            "name": "textinput1751433586926",
            "visible": true,
            "type": "string",
            "enabled": true,
            "readOnly": false,
            "default": "My Field Value",
            "label": {
              "visible": true,
              "value": "Text Input"
            },
            "events": {
              "custom:setProperty": [
                "$event.payload"
              ]
            },
            "properties": {
              "fd:dor": {
                "dorExclusion": false
              },
              "fd:path": "/content/forms/af/v2formorig/jcr:content/guideContainer/textinput"
            },
            "placeholder": "My Field Placeholder",
            ":type": "forms-components-examples/components/form/textinput"
          }
        },
        "allowedComponents": {
          "components": [
            {
              "path": "/content/forms/af/v2formorig/jcr:content/guideContainer/forms-components-examples/components/form/accordion",
              "title": "Adaptive Form Accordion"
            },
            {
              "path": "/content/forms/af/v2formorig/jcr:content/guideContainer/forms-components-examples/components/form/button",
              "title": "Adaptive Form Button"
            },
            {
              "path": "/content/forms/af/v2formorig/jcr:content/guideContainer/forms-components-examples/components/form/checkbox",
              "title": "Adaptive Form CheckBox"
            },
            {
              "path": "/content/forms/af/v2formorig/jcr:content/guideContainer/forms-components-examples/components/form/checkboxgroup",
              "title": "Adaptive Form CheckBox Group"
            },
            {
              "path": "/content/forms/af/v2formorig/jcr:content/guideContainer/forms-components-examples/components/form/container",
              "title": "Adaptive Form Container"
            },
            {
              "path": "/content/forms/af/v2formorig/jcr:content/guideContainer/forms-components-examples/components/form/datepicker",
              "title": "Adaptive Form Date Picker"
            },
            {
              "path": "/content/forms/af/v2formorig/jcr:content/guideContainer/forms-components-examples/components/form/dropdown",
              "title": "Adaptive Form Drop-down List"
            },
            {
              "path": "/content/forms/af/v2formorig/jcr:content/guideContainer/forms-components-examples/components/form/emailinput",
              "title": "Adaptive Form Email Input"
            },
            {
              "path": "/content/forms/af/v2formorig/jcr:content/guideContainer/forms-components-examples/components/form/fileinput",
              "title": "Adaptive Form File Attachment"
            },
            {
              "path": "/content/forms/af/v2formorig/jcr:content/guideContainer/forms-components-examples/components/form/footer",
              "title": "Footer"
            },
            {
              "path": "/content/forms/af/v2formorig/jcr:content/guideContainer/forms-components-examples/components/form/fragment",
              "title": "Adaptive Form Fragment"
            },
            {
              "path": "/content/forms/af/v2formorig/jcr:content/guideContainer/forms-core-components-it/form/hcaptcha",
              "title": "Adaptive Form hCaptcha® (v1)"
            },
            {
              "path": "/content/forms/af/v2formorig/jcr:content/guideContainer/forms-components-examples/components/form/image",
              "title": "Adaptive Form Image"
            },
            {
              "path": "/content/forms/af/v2formorig/jcr:content/guideContainer/forms-components-examples/components/form/numberinput",
              "title": "Adaptive Form Number Input"
            },
            {
              "path": "/content/forms/af/v2formorig/jcr:content/guideContainer/forms-components-examples/components/form/pageheader",
              "title": "Header"
            },
            {
              "path": "/content/forms/af/v2formorig/jcr:content/guideContainer/forms-components-examples/components/form/panelcontainer",
              "title": "Adaptive Form Panel"
            },
            {
              "path": "/content/forms/af/v2formorig/jcr:content/guideContainer/forms-components-examples/components/form/radiobutton",
              "title": "Adaptive Form Radio Button"
            },
            {
              "path": "/content/forms/af/v2formorig/jcr:content/guideContainer/forms-components-examples/components/form/recaptcha",
              "title": "Adaptive Form reCAPTCHA (v1)"
            },
            {
              "path": "/content/forms/af/v2formorig/jcr:content/guideContainer/forms-components-examples/components/form/actions/reset",
              "title": "Adaptive Form Reset Button"
            },
            {
              "path": "/content/forms/af/v2formorig/jcr:content/guideContainer/forms-components-examples/components/form/review",
              "title": "Adaptive Form Review"
            },
            {
              "path": "/content/forms/af/v2formorig/jcr:content/guideContainer/forms-components-examples/components/form/actions/submit",
              "title": "Adaptive Form Submit Button"
            },
            {
              "path": "/content/forms/af/v2formorig/jcr:content/guideContainer/forms-core-components-it/components/svg",
              "title": "Adaptive Form Svg"
            },
            {
              "path": "/content/forms/af/v2formorig/jcr:content/guideContainer/forms-components-examples/components/form/switch",
              "title": "Adaptive Form Switch"
            },
            {
              "path": "/content/forms/af/v2formorig/jcr:content/guideContainer/forms-components-examples/components/form/tabsontop",
              "title": "Adaptive Form Horizontal Tabs"
            },
            {
              "path": "/content/forms/af/v2formorig/jcr:content/guideContainer/forms-components-examples/components/form/telephoneinput",
              "title": "Adaptive Form Telephone Input"
            },
            {
              "path": "/content/forms/af/v2formorig/jcr:content/guideContainer/forms-components-examples/components/form/termsandconditions",
              "title": "Adaptive Form Terms And Conditions"
            },
            {
              "path": "/content/forms/af/v2formorig/jcr:content/guideContainer/forms-components-examples/components/form/text",
              "title": "Adaptive Form Text"
            },
            {
              "path": "/content/forms/af/v2formorig/jcr:content/guideContainer/forms-components-examples/components/form/textinput",
              "title": "Adaptive Form Text Box"
            },
            {
              "path": "/content/forms/af/v2formorig/jcr:content/guideContainer/forms-core-components-it/components/textinput/v1/textinput",
              "title": "Core Components IT - Custom Adaptive Form Text Input"
            },
            {
              "path": "/content/forms/af/v2formorig/jcr:content/guideContainer/forms-components-examples/components/form/title",
              "title": "Adaptive Form Title"
            },
            {
              "path": "/content/forms/af/v2formorig/jcr:content/guideContainer/forms-core-components-it/form/turnstile",
              "title": "Adaptive Form Cloudflare® Turnstile (v1)"
            },
            {
              "path": "/content/forms/af/v2formorig/jcr:content/guideContainer/forms-components-examples/components/form/verticaltabs",
              "title": "Adaptive Form Vertical Tabs"
            },
            {
              "path": "/content/forms/af/v2formorig/jcr:content/guideContainer/forms-components-examples/components/form/wizard",
              "title": "Adaptive Form Wizard Layout"
            },
            {
              "path": "/content/forms/af/v2formorig/jcr:content/guideContainer/forms-components-examples/components/draftsandsubmissions",
              "title": "Drafts and submissions"
            },
            {
              "path": "/content/forms/af/v2formorig/jcr:content/guideContainer/forms-components-examples/components/linkcomponent",
              "title": "Link"
            },
            {
              "path": "/content/forms/af/v2formorig/jcr:content/guideContainer/forms-components-examples/components/searchlister",
              "title": "Search and Lister"
            },
            {
              "path": "/content/forms/af/v2formorig/jcr:content/guideContainer/forms-components-examples/components/aemform",
              "title": "Adaptive Form - Embed"
            },
            {
              "path": "/content/forms/af/v2formorig/jcr:content/guideContainer/forms-components-examples/components/demo/component",
              "title": "Demo Component"
            },
            {
              "path": "/content/forms/af/v2formorig/jcr:content/guideContainer/forms-components-examples/components/demo",
              "title": "Forms Demo"
            }
          ],
          "applicable": false
        }
      })
    });

    if (response.ok) {
      const result = await response.json();
      console.log('Master XDP created successfully:', result);
      return result;
    } else {
      console.error('Failed to create Master XDP:', response.status, response.statusText);
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  } catch (error) {
    console.error('Error creating Master XDP:', error);
    throw error;
  }
}

function extractFormDefinition(block) {
  let formDef;
  const container = block.querySelector('pre');
  const codeEl = container?.querySelector('code');
  const content = codeEl?.textContent;
  if (content) {
    formDef = decode(content);
  }
  return { container, formDef };
}

export async function fetchForm(pathname) {
  // get the main form
  let data;
  let path = pathname;
  if (path.startsWith(window.location.origin) && !path.includes('.json')) {
    if (path.endsWith('.html')) {
      path = path.substring(0, path.lastIndexOf('.html'));
    }
    path += '/jcr:content/root/section/form.html';
  }
  let resp = await fetch(path);

  if (resp?.headers?.get('Content-Type')?.includes('application/json')) {
    data = await resp.json();
  } else if (resp?.headers?.get('Content-Type')?.includes('text/html')) {
    resp = await fetch(path);
    data = await resp.text().then((html) => {
      try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        if (doc) {
          return extractFormDefinition(doc.body).formDef;
        }
        return doc;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Unable to fetch form definition for path', pathname, path);
        return null;
      }
    });
  }
  return data;
}

export default async function decorate(block) {
  let container = block.querySelector('a[href]');
  let formDef;
  let pathname;
  if (container) {
    ({ pathname } = new URL(container.href));
    formDef = await fetchForm(container.href);
  } else {
    ({ container, formDef } = extractFormDefinition(block));
  }
  let source = 'aem';
  let rules = true;
  let form;
  if (formDef) {
    // const submitProps = formDef?.properties?.['fd:submit'];
    // const actionType = submitProps?.actionName || formDef?.properties?.actionType;
    // const spreadsheetUrl = submitProps?.spreadsheet?.spreadsheetUrl
    //   || formDef?.properties?.spreadsheetUrl;

    // if (actionType === 'spreadsheet' && spreadsheetUrl) {
    //   // Check if we're in an iframe and use parent window path if available
    //   const iframePath = window.frameElement ? window.parent.location.pathname
    //     : window.location.pathname;
    //   formDef.action = SUBMISSION_SERVICE + btoa(pathname || iframePath);
    // } else {
    //   formDef.action = getSubmitBaseUrl() + (formDef.action || '');
    // }
    if (pathname && pathname.includes('datasheet.json')) {
      //will add later
    }
    else {
     // createMasterXDP();
      if (isDocumentBasedForm(formDef)) {
        const transform = new DocBasedFormToAF();
        formDef = transform.transform(formDef);
        formDef = transformJson(formDef);
        //source = 'sheet';
        // form = await createForm(formDef);
        // const docRuleEngine = await import('./rules-doc/index.js');
        // docRuleEngine.default(formDef, form);
        // rules = false;
      } else {
        afModule = await import('./rules/index.js');
        if (afModule && afModule.initAdaptiveForm && !block.classList.contains('edit-mode')) {
          form = await afModule.initAdaptiveForm(formDef, createForm);
        } else {
          form = await createFormForAuthoring(formDef);
        }
      }
      form.dataset.redirectUrl = formDef.redirectUrl || '';
      form.dataset.thankYouMsg = formDef.thankYouMsg || '';
      form.dataset.action = formDef.action || pathname?.split('.json')[0];
      form.dataset.source = source;
      form.dataset.rules = rules;
      form.dataset.id = formDef.id;
      if (source === 'aem' && formDef.properties) {
        form.dataset.formpath = formDef.properties['fd:path'];
      }
      container.replaceWith(form);
    }
  }
}
