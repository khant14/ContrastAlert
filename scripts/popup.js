document.addEventListener('DOMContentLoaded', function() {
  const checkContrastButton = document.getElementById('checkContrast');
  
  // Check for existing contrast issues when popup opens
  chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
    if (tab) {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: () => {
          return window.contrastIssues || [];
        }
      });
      
      if (results[0].result && results[0].result.length > 0) {
        displayResults(results[0].result);
      }
    }
  });
  
  checkContrastButton.addEventListener('click', async () => {
    try {
      // Get the active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        throw new Error('No active tab found');
      }

      // First inject axe.js
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['lib/axe.min.js']
      });

      // Then execute the contrast check
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: checkPageContrast
      });

      if (!results || !results[0] || !results[0].result) {
        throw new Error('Failed to get contrast results');
      }

      // Process and display results
      const contrastIssues = results[0].result;
      if (contrastIssues && contrastIssues.length > 0) {
        displayResults(contrastIssues);
        
        // Store the contrast issues in the tab's context
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          function: (issues) => {
            window.contrastIssues = issues;
          },
          args: [contrastIssues]
        });
      } else {
        alert('No contrast issues found!');
      }
    } catch (error) {
      console.error('Error executing script:', error);
      alert('Error checking contrast: ' + error.message);
    }
  });
});

function checkPageContrast() {
  return new Promise((resolve) => {
    // Configure axe to only run color contrast rules
    const config = {
      rules: {
        'color-contrast': { enabled: true },
        'color-contrast-enhanced': { enabled: true }
      },
      disableOtherRules: true
    };

    // Run axe analysis
    axe.run(config, (err, results) => {
      if (err) {
        console.error('Error running axe:', err);
        resolve([]);
        return;
      }

      // Filter and format contrast violations
      const contrastIssues = results.violations
        .filter(violation => violation.id === 'color-contrast' || violation.id === 'color-contrast-enhanced')
        .map(violation => ({
          elements: violation.nodes.map(node => {
            // Extract contrast values from the node's any array
            const contrastData = node.any?.[0]?.data || {};
            
            return {
              selector: node.target.join(', '),
              html: node.html,
              contrast: contrastData.contrastRatio || 'Unknown',
              expectedContrast: contrastData.expectedContrastRatio || 'Unknown',
              actualContrast: contrastData.contrastRatio || 'Unknown',
              fgColor: contrastData.fgColor || 'Unknown',
              bgColor: contrastData.bgColor || 'Unknown',
              fontSize: contrastData.fontSize || 'Unknown',
              fontWeight: contrastData.fontWeight || 'Unknown'
            };
          }),
          impact: violation.impact,
          description: violation.description,
          help: violation.help
        }));

      // Highlight elements with contrast issues
      contrastIssues.forEach(issue => {
        issue.elements.forEach(element => {
          const elements = document.querySelectorAll(element.selector);
          elements.forEach(el => {
            el.style.outline = '2px solid red';
            el.style.outlineOffset = '2px';
            el.className = el.className + ' contrast-indicator';
            el.title = `Contrast Issue: Expected ${element.expectedContrast}, Actual ${element.actualContrast}\nForeground: ${element.fgColor}, Background: ${element.bgColor}`;
          });
        });
      });

      resolve(contrastIssues);
    });
  });
}

function displayResults(issues) {
  const content = document.getElementById('content');
  
  // Clear previous results
  const existingResults = document.getElementById('results');
  if (existingResults) {
    existingResults.remove();
  }

  // Create results container
  const resultsDiv = document.createElement('div');
  resultsDiv.id = 'results';
  resultsDiv.style.marginTop = '20px';
  resultsDiv.style.textAlign = 'left';

  // Add summary
  const summary = document.createElement('p');
  summary.textContent = `Found ${issues.length} contrast issues:`;
  resultsDiv.appendChild(summary);

  // Add detailed results
  issues.forEach((issue, index) => {
    const issueDiv = document.createElement('div');
    issueDiv.style.marginTop = '10px';
    issueDiv.style.padding = '10px';
    issueDiv.style.backgroundColor = '#f8f8f8';
    issueDiv.style.borderRadius = '4px';

    const issueTitle = document.createElement('h3');
    issueTitle.textContent = `Issue ${index + 1}: ${issue.impact} impact`;
    issueDiv.appendChild(issueTitle);

    const description = document.createElement('p');
    description.textContent = issue.description;
    issueDiv.appendChild(description);

    const help = document.createElement('p');
    // Get the minimum required contrast from the first element
    const minContrast = issue.elements[0]?.expectedContrast || 'Unknown';
    help.textContent = `${issue.help} (Minimum required contrast: ${minContrast})`;
    help.style.fontStyle = 'italic';
    issueDiv.appendChild(help);

    const elementsList = document.createElement('ul');
    issue.elements.forEach(element => {
      const li = document.createElement('li');
      li.textContent = `Element: ${element.selector}\nExpected Contrast: ${element.expectedContrast}\nActual Contrast: ${element.actualContrast}\nForeground: ${element.fgColor}\nBackground: ${element.bgColor}`;
      li.style.cursor = 'pointer';
      li.style.padding = '5px';
      li.style.borderRadius = '3px';
      li.style.transition = 'background-color 0.2s';
      
      li.addEventListener('mouseover', () => {
        li.style.backgroundColor = '#e0e0e0';
      });
      
      li.addEventListener('mouseout', () => {
        li.style.backgroundColor = 'transparent';
      });
      
      li.addEventListener('click', async () => {
        // Get the active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        // Execute script to scroll to and highlight the element
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          function: (selector) => {
            const element = document.querySelector(selector);
            if (element) {
              // Remove highlight from previously selected elements
              document.querySelectorAll('.contrast-indicator-selected').forEach(el => {
                el.classList.remove('contrast-indicator-selected');
                el.style.outline = '2px solid red';
              });
              
              // Add highlight to selected element
              element.classList.add('contrast-indicator-selected');
              element.style.outline = '3px solid #4CAF50';
              
              // Scroll element into view
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          },
          args: [element.selector]
        });
      });
      
      elementsList.appendChild(li);
    });
    issueDiv.appendChild(elementsList);

    resultsDiv.appendChild(issueDiv);
  });

  content.appendChild(resultsDiv);
} 