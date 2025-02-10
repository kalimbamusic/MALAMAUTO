document.addEventListener('DOMContentLoaded', async () => {
  // Load stored data on popup open
  chrome.storage.local.get(['extractedHours'], (result) => {
    if (result.extractedHours) {
      displayResults(result.extractedHours);
    }
  });
});

document.getElementById('extractHours').addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const targetUrl = 'https://smkb-sso.net.hilan.co.il/Hilannetv2/Attendance/calendarpage.aspx?isOnSelf=true';
    const homeUrl = 'https://smkb-sso.net.hilan.co.il/Hilannetv2/ng/personal-file/home';

    // Function to wait for navigation
    const waitForNavigation = (tabId) => {
      return new Promise(resolve => {
        chrome.tabs.onUpdated.addListener(function listener(updatedTabId, info) {
          if (updatedTabId === tabId && info.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        });
      });
    };

    // Function to check if the current URL matches the target URL
    const isTargetPage = (url) => {
      return url === targetUrl;
    };

    // Function to navigate to the target URL and handle redirects
    const navigateToTarget = async (tabId) => {
      let currentTab = await chrome.tabs.get(tabId);
      let attempts = 0;
      const maxAttempts = 3;

      while (!isTargetPage(currentTab.url) && attempts < maxAttempts) {
        if (currentTab.url === homeUrl) {
          console.log('Landed on home page, redirecting to target...');
        } else {
          console.log('Not on target page, redirecting...');
        }
        await chrome.tabs.update(tabId, { url: targetUrl });
        await waitForNavigation(tabId);
        currentTab = await chrome.tabs.get(tabId);
        attempts++;
        // Give the page a moment to fully load
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      if (!isTargetPage(currentTab.url)) {
        throw new Error('Failed to navigate to the target page after multiple attempts.');
      }
    };

    // Navigate to the target URL
    await navigateToTarget(tab.id);

    // Step 1: Select all relevant days
    console.log('Step 1: Selecting days...');
    const selectionResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: selectHilanDays
    });
    console.log('Selection completed:', selectionResult[0].result);

    // Step 2: Wait for a moment and click the "Selected Days" button
    console.log('Step 2: Clicking Selected Days button...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: clickSelectedDaysButton
    });

    // Step 3: Wait for the table to load and then extract data
    console.log('Step 3: Waiting for table and extracting data...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: extractDetailedHours
    });
    
    console.log('Extraction completed:', result[0].result);
    
    // Store the extracted data
    chrome.storage.local.set({ extractedHours: result[0].result });

    // Display results
    displayResults(result[0].result);
  } catch (error) {
    console.error('Error:', error);
    document.getElementById('result').textContent = 'Error: ' + error.message;
  }
});

document.getElementById('navigateToHRPortal').addEventListener('click', async () => {
  const hrPortalUrl = 'https://hrm-portal.malam-payroll.com/timesheets/timesheets-report/calendar';
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Function to wait for navigation
  const waitForNavigation = (tabId) => {
    return new Promise(resolve => {
      chrome.tabs.onUpdated.addListener(function listener(updatedTabId, info) {
        if (updatedTabId === tabId && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      });
    });
  };

  const isTargetPage = (url) => {
    return url === hrPortalUrl;
  };

  const navigateToTarget = async (tabId) => {
    let currentTab = await chrome.tabs.get(tabId);
    let attempts = 0;
    const maxAttempts = 3;

    while (!isTargetPage(currentTab.url) && attempts < maxAttempts) {
      console.log('Not on target page, redirecting...');
      await chrome.tabs.update(tabId, { url: hrPortalUrl });
      await waitForNavigation(tabId);
      currentTab = await chrome.tabs.get(tabId);
      attempts++;
      // Give the page a moment to fully load
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    if (!isTargetPage(currentTab.url)) {
      throw new Error('Failed to navigate to the target page after multiple attempts.');
    }
  };

  try {
    await navigateToTarget(tab.id);
    console.log('Navigated to HR Portal successfully.');
  } catch (error) {
    console.error('Error navigating to HR Portal:', error);
  }
});

document.getElementById('checkHRPortalData').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    function: checkCalendarAndStorage
  });
});

async function checkCalendarAndStorage() {
  // Utility function to wait for elements
  async function waitForElement(selector, parent = document, timeout = 5000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const element = parent.querySelector(selector);
      if (element) return element;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Element not found: ${selector}`);
  }

  // Get stored hours from Chrome storage
  async function getStoredHours() {
    return new Promise(resolve => {
      chrome.storage.local.get(['extractedHours'], result => {
        resolve(result.extractedHours || {});
      });
    });
  }

  // Set input value with event triggering
  async function setInputValue(selector, value) {
    const input = await waitForElement(selector);
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    console.log(`✅ Set value for ${selector}: ${value}`);
  }

  // Wait for modal to close
  async function waitForModalClose() {
    return new Promise(resolve => {
      new MutationObserver((_, observer) => {
        if (!document.querySelector('.report-form-wrapper__content')) {
          observer.disconnect();
          resolve();
        }
      }).observe(document.body, { childList: true, subtree: true });
    });
  }

  // Dismiss success toast
  async function dismissToast() {
    try {
      const toast = await waitForElement('.Toastify__toast', document, 3000);
      const closeButton = toast.querySelector('.payroll-toast__close-button') || toast;
      closeButton.click();
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch {
      console.log('ℹ️ No toast to dismiss');
    }
  }

  // Main processing function
  async function processDate(dateClass, hours) {
    try {
      console.log(`🔄 Processing ${dateClass}`);
      
      // 2. Find date element
      const dayElement = await waitForElement(`div.cv-day[class*="${dateClass}"]:not(.outsideOfMonth)`);
      
      // 3. Check for existing reports
      if (dayElement.querySelector('.timesheets-calendar__day--success')) {
        console.log(`⏭️ Skipping ${dateClass} (existing report)`);
        return;
      }

      // 4. Open date modal
      dayElement.click();
      await waitForElement('.report-form-wrapper__content');

      // 5. Fill time inputs
      const addButton = await waitForElement('button:has(span.v-btn__content i.far.fa-plus)');
      addButton.click();
      
      await setInputValue('input[aria-label="שדה טקסט שעת כניסה"]', hours.entrance);
      await setInputValue('input[aria-label="שדה טקסט שעת יציאה"]', hours.exit);

      // 6. Save and clean up
      const saveButton = await waitForElement('button[data-cy="timesheets-save-report-btn"]');
      saveButton.click();
      await dismissToast();
      await waitForModalClose();

      // 7. Stabilize calendar
      await new Promise(resolve => setTimeout(resolve, 1000));
      await waitForElement('div.cv-day:not(.cv-day-loading)');

    } catch (error) {
      console.error(`❌ Error processing ${dateClass}:`, error.message);
      await dismissToast(); // Cleanup on error
    }
  }

  // Main execution flow
  try {
    const storedHours = await getStoredHours();
    const dates = Object.entries(storedHours);
    
    console.log(`📅 Starting processing of ${dates.length} dates`);
    
    for (const [dateClass, hours] of dates) {
      await processDate(dateClass, hours);
    }
    
    console.log('🎉 All dates processed successfully');

  } catch (error) {
    console.error('💥 Critical error:', error);
  }
}

function displayResults(data) {
  const resultDiv = document.getElementById('result');
  console.log('Raw data:', data);
  
  if (!data || Object.keys(data).length === 0) {
    resultDiv.textContent = 'No hours found. Debug info: ' + JSON.stringify(data);
    return;
  }

  const table = document.createElement('table');
  table.innerHTML = `
    <tr>
      <th colspan="5" style="text-align: center; background-color: #f8f9fa;">${data[Object.keys(data)[0]].monthName} ${data[Object.keys(data)[0]].year}</th>
    </tr>
    <tr>
      <th>Date</th>
      <th>Formatted Date</th>
      <th>Entrance</th>
      <th>Exit</th>
      <th>Total</th>
    </tr>
    ${Object.entries(data).sort(([, a], [, b]) => {
      const dateA = parseInt(a.date.split('/')[0]);
      const dateB = parseInt(b.date.split('/')[0]);
      return dateA - dateB;
    }).map(([formattedDate, dayData]) => `
      <tr>
        <td>${dayData.date}</td>
        <td>${formattedDate || '-'}</td>
        <td>${dayData.entrance || '-'}</td>
        <td>${dayData.exit || '-'}</td>
        <td>${dayData.total || '-'}</td>
      </tr>
    `).join('')}
  `;
  
  resultDiv.innerHTML = '';
  resultDiv.appendChild(table);
}

function selectHilanDays() {
  // Find all date cells
 const dateCells = document.querySelectorAll('td[class*="cDIES"]');
  let selectedCount = 0;

  dateCells.forEach(cell => {
    // Check if the cell has a valid time entry
    const timeCell = cell.querySelector('.cDM');
    const dateCell = cell.querySelector('.dTS');
    
    if (timeCell && timeCell.textContent.trim() !== '' && 
        dateCell && parseInt(dateCell.textContent.trim()) <= 31) {
      // If not already selected
      if (!cell.classList.contains('CSD')) {
        cell.click();
        selectedCount++;
      }
    }
  });

  return `Selected ${selectedCount} dates`;
}

function clickSelectedDaysButton() {
  const selectedDaysButton = document.getElementById('ctl00_mp_RefreshSelectedDays');
  if (selectedDaysButton) {
    console.log('Clicking selected days button');
    selectedDaysButton.click();
    return true;
  } else {
    console.error('Selected days button not found');
    return false;
  }
}

function extractDetailedHours() {
  const daysObject = {};
  
  // Extract year from the month selector
  const monthSelector = document.getElementById('ctl00_mp_calendar_monthChanged');
  const monthName = monthSelector?.textContent.replace(/\d{4}/, '').trim();
  console.log(monthName);
  const monthMap = { 'ינואר': 1, 'פברואר': 2, 'מרץ': 3, 'אפריל': 4, 'מאי': 5, 'יוני': 6, 'יולי': 7, 'אוגוסט': 8, 'ספטמבר': 9, 'אוקטובר': 10, 'נובמבר': 11, 'דצמבר': 12 };
  const numericMonth = monthMap[monthName];
  console.log(numericMonth);
  const year = monthSelector?.textContent.match(/\d{4}/);
  
  // Get all rows from the detailed view
  const detailsTable = document.querySelector('table[id*="RG_Days_"]');
  if (!detailsTable) {
    console.error('Details table not found');
    return daysObject;
  }

  const rows = detailsTable.querySelectorAll('tr[id*="_row_"]');
  console.log('Found detail rows:', rows.length);
  
  rows.forEach((row, index) => {
    try {
      // Get all cells in the row
      const cells = row.getElementsByTagName('td');
      console.log(`Processing row ${index}:`, cells.length, 'cells');
      
      if (cells.length >= 4) {
        const date = cells[0]?.textContent?.trim();
        
        // Extract entrance time (from the third column)
        const entranceInput = cells[5]?.querySelector('input[id*="ManualEntry"]');
        const entrance = entranceInput?.value || cells[5]?.getAttribute('ov') || '';
        
        // Extract exit time (from the fourth column)
        const exitInput = cells[6]?.querySelector('input[id*="ManualExit"]');
        const exit = exitInput?.value || cells[6]?.getAttribute('ov') || '';
        
        // Extract total time (from the first column after date)
        const totalCell = cells[7];
        let total = '';
        
        if (totalCell) {
          // Try to get total from span first
          const totalSpan = totalCell.querySelector('span[class*="ROC"]');
          if (totalSpan) {
            total = totalSpan.textContent.trim();
          } else {
            // Fallback to cell's ov attribute
            total = totalCell.getAttribute('ov') || '';
          }
        }
        
        console.log('Row data:', { date, entrance, exit, total, year });
        
        if (date && parseInt(date) <= 31) {
          const cleanDate = date.replace(/[א-ת]/g, '').trim();
          const dateObj = new Date(parseInt(year), numericMonth - 1, parseInt(cleanDate));
          const formattedMonth = String(numericMonth).padStart(2, '0');
          console.log(year);
          const formattedDay = String(dateObj.getDate()).padStart(2, '0');
          const formattedDate = `d${year}-${formattedMonth}-${formattedDay}`;

          daysObject[formattedDate] = {
            date,
            entrance,
            exit,
            total,
            year,
            monthName
          };
        }
      }
    } catch (error) {
      console.error('Error processing row:', error);
    }
  });
  
  console.log('Extracted days:', daysObject);
  return daysObject;
}
