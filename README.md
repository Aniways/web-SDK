#Aniways' Web SDK

The Aniways SDK for the web  
    
##Create your Aniways App  

First, please go to [www.aniways.com](http://www.aniways.com) 
then add a new App on our dashboard

![](http://www.aniways.com/ckeditor_assets/pictures/65/content_add-app.jpg)  


Now get the automatically generated App Id.

##Installing the Aniways SDK  


Install with [Bower](http://www.bower.io):  

	bower install aniways

Or download the latest dist file:  
  
* aniways.min.js
* aniways.css


##Integration

* Add the `aniways-wall` class to your chat message wall.
* Add the `aniways-message` class to any element containing messaging text.
* Replace your chats textarea with a `contentEditable` div.
* Add the `aniways-div` class to the div.
* Call the `Aniways.init(appId, [configuration])` function as soon as the chat section is added to the DOM.

##Customization

There are 2 ways to customize the Aniways SDK.  
###Using the configuration object.  
Pass a config object as a second param to the `Aniways.init` function
optional properties are  
#####inputImageSize
sets the image size for images in the `aniways-div` element
#####popoverImageSize
sets the image size for images in the `popover` element
#####wallImageSize
sets the image size for images in the `aniways-wall` element

###Using css classes.

Aniways Images are added the with specific classes
#####aniways-wall-image
Images in the `aniways-div` element
#####aniways-popover-image
Images in the `popover` element
#####aniways-wall-image
Images in the `aniways-wall` element

####Caveats
If you want to control the images height from css classes you need to use the `!important` directive or they will be ignored.
