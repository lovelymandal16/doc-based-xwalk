const datefield = require("./asset/datefield.json");
const defaultPageTemplate = require("./asset/defaultPageTemplate.json");

function transformJson(inputJson) {
    const result = transformJsonUtil(inputJson);
    const dor = getOrCreateDor(result);
    dor.pageTemplate = defaultPageTemplate.pageTemplate;
    console.log(result);
    return result;
}

const transformJsonUtil = (inputJson) => {
    const result = {};
    for (const key in inputJson) {
        if (inputJson.hasOwnProperty(key)) {
            const value = inputJson[key];
            if (value !== null && Array.isArray(value) && key === "items") {
            transformArray(result, value);
        } else {
            result[key] = value;
        }
    }
}   
    return result;
}

const transformArray = (result, array) => {
    if (array.length === 0) {
        return;
    }
    result[":items"] = {};
    result[":itemsOrder"] =[];
    for (const item of array) {
        result[":items"][item.id] = transformJsonUtil(item);
        addDorContainer(result[":items"][item.id]);
        result[":itemsOrder"].push(item.id);
    }
}

const addDorContainer = (item) => {
    const fieldTypeJson = fieldTypeBasedJson(formdefTypeToCRISPRType[item.fieldType]);
    const dor = getOrCreateDor(item);
    dor.dorContainer = fieldTypeJson;
    const dataRef = item["dataRef"];
    if(dataRef){
        const bind = {
            "ref": dataRef,
            "match": "dataRef"
        }
        item["properties"]["fd:dor"]["dorContainer"]["bind"] = bind;
    }
}

const getOrCreateDor = (item) => {
    item["properties"] = item["properties"] || {};
    item["properties"]["fd:dor"] = item["properties"]["fd:dor"] || {};
    return item["properties"]["fd:dor"];
}

const formdefTypeToCRISPRType = {
    "date": "datetimefield"
};

const fieldTypeBasedJson = (type) => {
    switch(type){
        case "datetimefield":
           return datefield;
        default:
            return null;
    }
};

module.exports = { 
    transformJson, 
    formdefTypeToCRISPRType, 
    fieldTypeBasedJson 
}; 