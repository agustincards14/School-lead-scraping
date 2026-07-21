# Playwright Scraper Prompt

I want you to create a Playwright script that does the following:

1. Define the `baseURL` as `https://uhsaa.org/school-directory/`
2. Create a loop that iterates through the array in `ids.txt`
3. For each loop iteration, do the following:
   1. Assign the current index/number to the variable `id`
   2. Use the `id` variable to fetch a new endpoint in the `baseURL` with the `schoolID` query parameter. For example: `https://uhsaa.org/school-directory/?schoolID=1` when `id==1`
   3. Wait for the page to load
   4. Extract the following information by splitting the text value of the `.school-name` element by the space character:
      - **Mascot**: the last element
      - **School Name**: all elements except the last one
   5. Extract the Name and Email from each soccer coach that exists in the `.staff-table`. 
      - The sport will be contained in the `tr > td` text value. 
      - The Name and Email information will be contained in the second `<td>` element, within an `<a>` element. 
      - Do this for **Boys Soccer** and **Girls Soccer**. 
      - Avoid duplicates. Create a set of contacts.
   6. Filter the collected data by verifying the presence of an email address for each individual; strictly discard any 'contact card' where the email is missing.
   7. Asynchronously write the valid entries into a `.csv` file containing the fields: **School Name**, **Mascot**, **Email**, and **Name**.
4. Create a test for this scraper by iterating through 5 different schools (`id`s). Create a different test file for this test.
