import { expect, test, type Page } from "@playwright/test";

async function drawStroke(page: Page, start: { x: number; y: number }, end: { x: number; y: number }) {
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
}

async function readCanvasPixel(page: Page, point: { x: number; y: number }) {
  return page.locator("canvas").evaluate(
    (canvas, relativePoint) => {
      const context = canvas.getContext("2d");
      if (!context) {
        return null;
      }

      const pixelRatio = canvas.width / canvas.getBoundingClientRect().width;
      const imageData = context.getImageData(
        Math.floor(relativePoint.x * pixelRatio),
        Math.floor(relativePoint.y * pixelRatio),
        1,
        1
      ).data;

      return {
        red: imageData[0],
        green: imageData[1],
        blue: imageData[2],
        alpha: imageData[3]
      };
    },
    point
  );
}

test("eraser commits do not leave a selection outline", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New Session" }).click();

  await page.getByPlaceholder("Enter your name").fill("Alice");
  await page.getByRole("button", { name: "Enter Room" }).click();
  await expect(page.getByText("Alice")).toBeVisible();

  await page.getByTitle("Eraser").click();
  await expect(page.getByTitle("Eraser")).toHaveAttribute("aria-pressed", "true");
  await drawStroke(page, { x: 600, y: 200 }, { x: 660, y: 260 });

  await expect
    .poll(async () => {
      const pixel = await readCanvasPixel(page, { x: 595, y: 192 });
      return pixel ? `${pixel.red},${pixel.green},${pixel.blue},${pixel.alpha}` : null;
    })
    .toBe("248,249,250,255");
});

test("eraser stays attached per item when one erase stroke hits multiple items", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New Session" }).click();

  await page.getByPlaceholder("Enter your name").fill("Alice");
  await page.getByRole("button", { name: "Enter Room" }).click();
  await expect(page.getByText("Alice")).toBeVisible();

  const referenceDot = await readCanvasPixel(page, { x: 200, y: 200 });
  const referenceDotColor = referenceDot
    ? `${referenceDot.red},${referenceDot.green},${referenceDot.blue},${referenceDot.alpha}`
    : null;

  await drawStroke(page, { x: 280, y: 300 }, { x: 520, y: 300 });

  await page.getByTitle("Rectangle").click();
  await drawStroke(page, { x: 360, y: 240 }, { x: 440, y: 360 });

  await page.getByTitle("Eraser").click();
  await drawStroke(page, { x: 400, y: 220 }, { x: 400, y: 380 });

  await page.getByTitle("Select and move").click();
  await page.mouse.click(380, 240);
  await page.mouse.move(400, 300);
  await page.mouse.down();
  await page.mouse.move(520, 300, { steps: 6 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const pixel = await readCanvasPixel(page, { x: 400, y: 300 });
      return pixel ? `${pixel.red},${pixel.green},${pixel.blue},${pixel.alpha}` : null;
    })
    .toBe(referenceDotColor);

  await expect
    .poll(async () => {
      const pixel = await readCanvasPixel(page, { x: 520, y: 240 });
      return pixel ? `${pixel.red},${pixel.green},${pixel.blue},${pixel.alpha}` : null;
    })
    .toBe(referenceDotColor);
});

test("undo and redo restore moved items", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New Session" }).click();

  await page.getByPlaceholder("Enter your name").fill("Alice");
  await page.getByRole("button", { name: "Enter Room" }).click();
  await expect(page.getByText("Alice")).toBeVisible();

  const originalPoint = { x: 350, y: 220 };
  const movedPoint = { x: 470, y: 220 };
  const originalBackground = await readCanvasPixel(page, originalPoint);
  const movedBackground = await readCanvasPixel(page, movedPoint);

  await page.getByTitle("Rectangle").click();
  await drawStroke(page, { x: 300, y: 220 }, { x: 400, y: 300 });

  await page.getByTitle("Select and move").click();
  await page.mouse.click(350, 220);
  await page.mouse.move(350, 260);
  await page.mouse.down();
  await page.mouse.move(470, 260, { steps: 6 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const pixel = await readCanvasPixel(page, movedPoint);
      return pixel ? `${pixel.red},${pixel.green},${pixel.blue},${pixel.alpha}` : null;
    })
    .not.toBe(
      movedBackground
        ? `${movedBackground.red},${movedBackground.green},${movedBackground.blue},${movedBackground.alpha}`
        : null
    );

  await page.getByTitle("Undo").click();

  await expect
    .poll(async () => {
      const pixel = await readCanvasPixel(page, originalPoint);
      return pixel ? `${pixel.red},${pixel.green},${pixel.blue},${pixel.alpha}` : null;
    })
    .not.toBe(
      originalBackground
        ? `${originalBackground.red},${originalBackground.green},${originalBackground.blue},${originalBackground.alpha}`
        : null
    );

  await expect
    .poll(async () => {
      const pixel = await readCanvasPixel(page, movedPoint);
      return pixel ? `${pixel.red},${pixel.green},${pixel.blue},${pixel.alpha}` : null;
    })
    .toBe(
      movedBackground
        ? `${movedBackground.red},${movedBackground.green},${movedBackground.blue},${movedBackground.alpha}`
        : null
    );

  await page.getByTitle("Redo").click();

  await expect
    .poll(async () => {
      const pixel = await readCanvasPixel(page, movedPoint);
      return pixel ? `${pixel.red},${pixel.green},${pixel.blue},${pixel.alpha}` : null;
    })
    .not.toBe(
      movedBackground
        ? `${movedBackground.red},${movedBackground.green},${movedBackground.blue},${movedBackground.alpha}`
        : null
    );
});

test("creates, joins, syncs, refreshes, and exports a room", async ({ browser, page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New Session" }).click();

  const roomUrl = page.url();

  await page.getByPlaceholder("Enter your name").fill("Alice");
  await page.getByRole("button", { name: "Enter Room" }).click();
  await expect(page.getByText("Alice")).toBeVisible();

  await drawStroke(page, { x: 420, y: 240 }, { x: 700, y: 420 });
  await expect(page.locator('button[title="Undo"]')).toBeEnabled();

  await page.getByTitle("Rectangle").click();
  await expect(page.getByTitle("Rectangle")).toHaveAttribute("aria-pressed", "true");
  await drawStroke(page, { x: 330, y: 210 }, { x: 450, y: 290 });

  await page.getByTitle("Select and move").click();
  await expect(page.getByTitle("Select and move")).toHaveAttribute("aria-pressed", "true");
  await page.mouse.click(390, 210);
  await page.mouse.move(390, 250);
  await page.mouse.down();
  await page.mouse.move(390, 330, { steps: 6 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const pixel = await readCanvasPixel(page, { x: 330, y: 330 });
      return pixel ? `${pixel.red},${pixel.green},${pixel.blue},${pixel.alpha}` : null;
    })
    .not.toBe("248,249,250,255");

  await page.getByTitle("Text").click();
  await expect(page.getByTitle("Text")).toHaveAttribute("aria-pressed", "true");
  await page.mouse.click(500, 230);
  await page.locator("form input").fill("Plan A");
  await page.keyboard.press("Enter");
  await expect(page.locator("form input")).toHaveCount(0);

  await page.getByTitle("Select and move").click();
  await expect(page.getByTitle("Select and move")).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(505, 235);
  await page.mouse.down();
  await page.mouse.move(580, 280, { steps: 6 });
  await page.mouse.up();

  await page.getByTitle("Arrow").click();
  await expect(page.getByTitle("Arrow")).toHaveAttribute("aria-pressed", "true");
  await drawStroke(page, { x: 540, y: 360 }, { x: 700, y: 450 });

  await page.getByTitle("Select and move").click();
  await expect(page.getByTitle("Select and move")).toHaveAttribute("aria-pressed", "true");
  await page.mouse.click(620, 405);
  await page.mouse.move(620, 435);
  await page.mouse.down();
  await page.mouse.move(690, 500, { steps: 6 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const pixel = await readCanvasPixel(page, { x: 690, y: 470 });
      return pixel ? `${pixel.red},${pixel.green},${pixel.blue},${pixel.alpha}` : null;
    })
    .not.toBe("248,249,250,255");

  await page.getByTitle("Pen").click();
  await expect(page.getByTitle("Pen")).toHaveAttribute("aria-pressed", "true");
  await drawStroke(page, { x: 723, y: 523 }, { x: 817, y: 587 });

  await page.getByTitle("Select and move").click();
  await expect(page.getByTitle("Select and move")).toHaveAttribute("aria-pressed", "true");
  await page.mouse.click(770, 555);
  await page.mouse.move(725, 580);
  await page.mouse.down();
  await page.mouse.move(775, 630, { steps: 6 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const pixel = await readCanvasPixel(page, { x: 820, y: 605 });
      return pixel ? `${pixel.red},${pixel.green},${pixel.blue},${pixel.alpha}` : null;
    })
    .not.toBe("248,249,250,255");

  const secondPage = await browser.newPage();
  await secondPage.goto(roomUrl);
  await secondPage.getByPlaceholder("Enter your name").fill("Bob");
  await secondPage.getByRole("button", { name: "Enter Room" }).click();
  await expect(secondPage.getByText("Bob")).toBeVisible();
  await expect(secondPage.getByText("Alice")).toBeVisible();

  await expect
    .poll(async () => {
      const pixel = await readCanvasPixel(secondPage, { x: 330, y: 330 });
      return pixel ? `${pixel.red},${pixel.green},${pixel.blue},${pixel.alpha}` : null;
    })
    .not.toBe("248,249,250,255");

  const remotePixel = await readCanvasPixel(secondPage, { x: 330, y: 330 });
  expect(remotePixel?.alpha).toBe(255);

  await page.reload();
  await expect(page.getByText("Alice")).toBeVisible();
  await expect(page.getByText("Bob")).toBeVisible();
  await expect(page.locator('button[title="Undo"]')).toBeEnabled();

  const downloadPromise = page.waitForEvent("download");
  await page.getByTitle("Export PNG").click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("collaborate-board.png");
  expect(await download.path()).not.toBeNull();
});
