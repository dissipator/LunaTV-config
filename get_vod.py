#Remove duplicates
import requests
import json

def get_json(url,headers={},payload={}):

    response = requests.request("GET", url, headers=headers, data=payload)
    # print(response.text)
    rst = response.json()
    if type(rst) != dict:
        return json.loads(rst)
    return rst

def remove_duplicates(json_data):
    unique_items = {"cache_time": 9200,
                    "api_site": {}}
    api_list = []
    print(type(unique_items))
    for key in json_data['api_site']:
        site = json_data['api_site'][key]
        if site["api"] not in api_list:
            unique_items["api_site"][site["name"]] = site
        api_list.append(site["api"])
    return unique_items

def mergi_json(urls):
    json_data= {}
    for url in urls:
        json_data.update(get_json(url))
        remove_duplicates(json_data)
    return json_data

if __name__ == "__main__":
    urls = ["https://raw.githubusercontent.com/666zmy/MoonTV/refs/heads/main/config.json",
            "https://jjpz.hafrey.dpdns.org?config=0"]
    json_data = mergi_json(urls)
    with open("LunaTV-config.json", 'w') as file:
        json.dump(json_data, file, indent=2)

