src=open('/home/user/claude-s-space/slingshot-phone.html').read()
src=src.replace('<meta name="claude:viewport-fit-sides" content="cover">\n','')
i=src.index('<canvas id="gl"'); head,body=src[:i],src[i:]
D="A gravity game for your phone. Throw a comet past stars and moons and collect every target."
pre=f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="theme-color" content="#05060c">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Slingshot">
<link rel="canonical" href="https://areabake.com/phone">
<link rel="manifest" href="/phone.webmanifest">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/slingshot-180.png">
<meta property="og:type" content="website">
<meta property="og:url" content="https://areabake.com/phone">
<meta property="og:title" content="Slingshot">
<meta property="og:description" content="{D}">
<meta property="og:image" content="https://areabake.com/og-slingshot.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://areabake.com/og-slingshot.png">
<style>:root{{padding-top:0;padding-bottom:0}}[hidden]{{display:none!important}}</style>
'''
open('/home/user/claude-s-space/site/phone.html','w').write(pre+head+'</head>\n<body>\n'+body+'\n</body>\n</html>\n')
