## **1\) Required questions (minimum to reach prequalified)**

### **A. Consent and contact**

1. **Are you looking for financing for a manufactured home today?**  
    (Yes, no)

2. **Is it okay for TLC to contact you by phone or email about this request?**  
    (Yes, no)  
    If no, set `status = do_not_contact`

3. **What is your full name?**  
    Maps to `applicant.full_name`

4. **What is the best phone number to reach you?**  
    “I can confirm the number I see is \[repeat\]. Is that correct?”  
    Maps to `applicant.phone_e164`

5. **Do you prefer we contact you by phone or email?**  
    (Phone, email)  
    Maps to `applicant.preferred_contact_method`

---

### **B. Property location**

6. **What ZIP code will the home be placed in?**  
    Maps to `home_and_site.property_zip`

7. **What state is that in?**  
    Maps to `home_and_site.property_state`

---

### **C. Land situation**

8. **Do you currently own the land where the home will go?**  
    (Yes, no, not sure)

If yes, set `land_status = own`  
 If no, ask the follow up in section 3  
 If not sure, set `land_status = not_sure`

---

### **D. Home basics**

9. **What type of home is this?**  
    (Manufactured, mobile home built before 1976, modular, not sure)  
    Maps to `home_and_site.home_type`

10. **Is this a new home purchase?**  
     (Yes, no, not sure)  
     Maps to `home_and_site.is_new_home_purchase`

---

### **E. Timing**

11. **When are you hoping to move forward?**  
     (0 to 3 months, 3 to 6 months, 6 to 12 months, 12 plus, not sure)  
     Maps to `home_and_site.timeline`

---

### **Financial snapshot**

15. **Which credit range fits best?**  
     (Under 580, 580 to 619, 620 to 679, 680 to 719, 720 plus, prefer not to say)  
     Maps to `financial_snapshot.credit_band_self_reported`

16. **What is your estimated monthly household income?**  
     “An estimate is fine, or you can skip.”  
     Maps to `financial_snapshot.monthly_income_estimate_usd`

17. **Have you had a bankruptcy recently?**  
     (Yes, no, prefer not to say)  
     Maps to `financial_snapshot.has_recent_bankruptcy`  
     If prefer not to say, store null

## **2\) Optional questions (high value, still non sensitive)**

### **Affordability context**

12. **About how much do you expect the home to cost?**  
     (Exact number or range is fine)  
     Maps to `home_and_site.home_price_estimate_usd`

### **Site work**

13. **Do you expect any site work will be needed?**  
     (Foundation, utilities, septic, well, driveway, grading, deck, skirting, not sure)  
     Maps to `home_and_site.site_work_needed`

14. **Do you have a rough budget for site work?**  
     Maps to `home_and_site.site_work_budget_estimate_usd`

### **Follow up timing**

18. **What is the best time for a loan officer to reach you?**  
     (Morning, afternoon, evening, weekday morning, weekday evening, weekend)  
     Maps to `applicant.best_time_to_contact`

### **Notes**

19. **Any details you want us to know?**  
     Example prompts: “single wide or double wide, already picked a home, delivery concerns”  
     Maps to `notes.free_text`

---

## **3\) Conditional follow ups (asked only when needed)**

### **Land status follow up if they do NOT own the land**

If Q8 was “No”, ask:

20. **Where will the home be placed?**  
     (buying land, family land, gifted land, not sure)

Mapping:

* buying land → `land_status = buying`

* family land → `land_status = family_land`

* gifted land → `land_status = gifted_land`

* not sure → `land_status = not_sure`

---

### **Land value band question (only if land value is relevant)**

Ask only when `land_status` is `own`, `buying`, `family_land`, `gifted_land`

21. **Do you have a rough idea what the land is worth?**  
     (0 to 25k, 25k to 50k, 50k to 100k, 100k to 200k, 200k plus, not sure)  
     Maps to `home_and_site.land_value_band`

---

### **Dealer context (only for global entrypoints)**

Ask only when entrypoint is `lender_global_site` or `lender_global_phone`

22. **Are you already working with a specific dealer?**  
     (Yes, no)  
     If yes: “What is the dealer name and what city are they in?”  
     This can go into `notes.free_text` for V2.

---

## **Recommended “prequalified ready” rule**

You can safely mark `status = prequalified` when you have:

* Full name

* Phone number

* ZIP

* State

* Land status

* Home type

* Timeline

* Consents captured

Everything else is helpful but optional.

