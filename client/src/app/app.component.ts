import { Component, ElementRef, ViewChild } from '@angular/core';
import { DataService } from './data.service';

@Component({
	selector: 'app-root',
	templateUrl: './app.component.html',
	styleUrls: ['./app.component.css'],
	providers: [DataService]
})

export class AppComponent {
	title 				= 'MyGovBC Captcha Widget Client Example.';
	captchaValid 	= null;
	jwt 					= "";
	validation 		= "";
	answer 				= "";

	@ViewChild('captcha') captchaContainer: ElementRef
	constructor(private dataService: DataService, private element: ElementRef) {
		this.getNewCaptcha(false);
	}

	// Handle form submission
	public onSubmit() {
		// Attempt to validate the user's token.
		// console.log("onsubmit", this.answer);

		this.dataService.verifyCaptcha(this.answer, this.validation).subscribe(
			(res) => this.handleVerify(res)
			);
	}

	// Call the backend to see if our answer is correct
	private handleVerify(payload) {
		// console.log("payload response:", payload);

		if (payload.valid === true) {
			this.captchaValid = true;
			this.jwt = payload.jwt;
		} else {
			this.captchaValid = false;
			// They failed - try a new one.
			this.getNewCaptcha(true);
		}
	}

	public getNewCaptcha(errorCase) {
		console.log("getting new captcha.");
		// Reset things
		this.jwt = "";
		if (!errorCase) {
			// Let them know they failed instead of wiping out the answer area
			// Contructing this form on page load/reload will have errorCase = false
			this.captchaValid = null;
		}
		this.dataService.fetchData().subscribe(
			(res) => this.handleCaptcha(res)
			);
	}

	// We received a payload from the server - apply it to our form.
	private handleCaptcha(payload) {
		// console.log("payload:", payload);

		this.captchaContainer.nativeElement.innerHTML = payload.captcha;
		this.validation = payload.validation;
	}
}
