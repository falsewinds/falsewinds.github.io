let default_layout = {
    "type": "scene",
    "background": "@background",
    "content": [
        {   "key": "title",
            "type": "text",
            "styles": {
                "top": 0,
                "left": "10%",
                "width": "80%",
                "height": 82,
                "padding": 16,
                "border": "none",
                "font-size": 48,
                "text-align": "center",
                "line-height": 50,
                "color": "black"
            },
            "content": "@title",
        },
        {   "key": "details",
            "type": "block",
            "styles": {
                "top": 90,
                "left": "5%",
                "right": "5%",
                "height": "auto"
            },
            "content": [
                {   "key": "picture",
                    "type": "image",
                    "styles": {
                        "top": 0,
                        "left": 0,
                        "width": 450,
                        "height": 450,
                        "padding": [ 0 ]
                    },
                    "content": "@picture"
                },
                {   "key": "description",
                    "type": "text",
                    "styles": {
                        "top": 0,
                        "left": 450,
                        "right": 0,
                        "height": "auto",
                        "padding": [ 8 ],
                        "font-size": 16,
                        "color": "black"
                    },
                    "content": "@description"
                }
            ]
        },
        {   "key": "main",
            "type": "options",
            "styles": {
                "left": "5%",
                "right": "5%",
                "bottom": "5%",
                "height": "auto",
            },
            "direction": "LRTB",
            "columns": 4,
            "spacing": 4,
            "template": {
                "key": "main_option",
                "type": "component",
                "styles": {
                    "padding": 4,
                    "background-color": "white",
                    "cursor": "pointer"
                },
                "border": {
                    "width": [ 1 ],
                    "style": [ "solid" ],
                    "color": "black",
                    "corner": 4
                },
                "content": [
                    {   "key": "option_title",
                        "type": "text",
                        "styles": {
                            "font-size": 24,
                            "line-height": 32,
                            "text-align": "center",
                        },
                        "background": "white",
                        "content": "@title"
                    }
                ],
                "listener": {
                    "hover": {
                        "background": "rgb(200,200,200)"
                    }
                }
            }
        }
    ]
};
    
let default_story = {
    "entrance": "scene0",
    "scenes": {
        "scene0": {
            "title": "場景入口",
            "description": [ "這是一個作為入口的場景。", "場景包含標題、描述，還有選項。", "描述可以容納多行文字。" ],
            "layout": "default",
            "background": {
                "uri": "/images/entrance.jpg",
                "clip": [ 0 ],
            },
            "options": {
                "main": [
                    {   "title": "前往下一個場景",
                        "action": "GOTO(scene1)"
                    }
                ]
            },
        },
        "scene1": {
            "title": "第二個場景",
            "description": [ "這是第二個場景。" ],
            "layout": "default",
            "background": "black",
            "options": {
                "main": [
                    {   "title": "獲得旗標",
                        "condition": "COUNT(flag1)<10",
                        "action": "GAIN(flag1,1)"
                    },
                    {   "title": "失去旗標",
                        "condition": "COUNT(flag1)>0",
                        "action": "GAIN(flag1,-1)"
                    },
                    {   "title": "前往下一個場景",
                        "action": "GOTO(scene2)"
                    }
                ]
            },
            "listener": {
                "enter": "SHOW(@hover,[flag1,1]),GAIN(flag1,1)"
            }
        },
        "scene2": {
            "title": "第三個場景",
            "description": [ "這是第三個場景。" ],
            "layout": "default",
            "background": "white",
            "options": {
                "main": [
                    {   "title": "獲得旗標並回到第一個場景",
                        "action": "GAIN(flag1,1);GOTO(scene0)"
                    },
                    {   "title": "失去所有旗標並回到第二個場景",
                        "condition": "COUNT(flag1)>0",
                        "action": "GAIN(flag1,COUNT(flag1));GOTO(scene1)"
                    }
                ]
            }
        }
    },
    "layouts": {
        "default": default_layout
    }
};

export { default_layout, default_story };