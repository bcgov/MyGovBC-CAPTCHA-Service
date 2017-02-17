import { Injectable } from '@angular/core';
import { Http } from '@angular/http';
import 'rxjs/Rx';

@Injectable()
export class DataService {

  constructor(private http: Http) { }

  fetchData() {
  	return this.http.post('http://localhost:3000/captcha', {nonce: "12341234"}, {})
  	.map(
  		(res) => res.json()
  	);
  }

  verifyCaptcha(answer, encryptedAnswer) {
    return this.http.post('http://localhost:3000/verify/captcha', {nonce: "12341234", answer: answer, encryptedAnswer: encryptedAnswer}, {})
  	.map(
  		(res) => res.json()
  	);
  }

}
