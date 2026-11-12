# Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
# Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
import asyncio, sys
from playwright.async_api import async_playwright
SRC = sys.argv[1]; OUT = sys.argv[2]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        pg = await b.new_page(viewport={"width":1400,"height":900})
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto("file://"+SRC); await pg.wait_for_timeout(800)
        # story: open-questions section and its gap link
        h = await pg.query_selector('xpath=//h2[contains(., "What the papers leave open")]')
        await h.scroll_into_view_if_needed(); await pg.screenshot(path=OUT+"/s1_story_open.png")
        await pg.click('a[data-gap="G2"]'); await pg.wait_for_timeout(400)
        await pg.screenshot(path=OUT+"/s2_after_click_G2.png")
        vis = await pg.evaluate("!document.getElementById('v-gaps').classList.contains('hidden')")
        top = await pg.evaluate("document.getElementById('gap-G2').getBoundingClientRect().top")
        await pg.evaluate("window.scrollTo(0,0)"); await pg.wait_for_timeout(100)
        await pg.screenshot(path=OUT+"/s3_gaps_top.png")
        for gid in ["G1","G6","G14"]:
            c = await pg.query_selector('#gap-'+gid); await c.scroll_into_view_if_needed(); await c.screenshot(path=OUT+f"/s4_{gid}.png")
        kerr_g = await pg.evaluate("document.querySelectorAll('#v-gaps .katex-error').length")
        nkatex = await pg.evaluate("document.querySelectorAll('#v-gaps .katex').length")
        # a gap source node link jumps to the map
        await pg.click('#gap-G2 a.nl'); await pg.wait_for_timeout(500)
        await pg.screenshot(path=OUT+"/s5_map_from_gap.png")
        mapvis = await pg.evaluate("!document.getElementById('v-map').classList.contains('hidden')")
        await pg.click('#tabs button[data-v="caveats"]'); await pg.wait_for_timeout(200)
        cl = await pg.query_selector('xpath=//h3[contains(., "Changelog")]'); await cl.scroll_into_view_if_needed(); await pg.screenshot(path=OUT+"/s6_changelog.png")
        await pg.click('#tabs button[data-v="story"]'); await pg.wait_for_timeout(200)
        kerr_s = await pg.evaluate("document.querySelectorAll('#v-story .katex-error').length")
        print({'gaps_visible_after_click':vis,'G2_top_px':round(top),'katex_in_gaps':nkatex,'katex_errors_gaps':kerr_g,'katex_errors_story':kerr_s,'map_visible_after_node_click':mapvis,'page_errors':errs})
        await b.close()
asyncio.run(main())
